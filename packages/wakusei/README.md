# Wakusei

![Wakusei logo](https://raw.githubusercontent.com/nakita628/wakusei/refs/heads/main/assets/icon/wakusei.png)

```bash
npm install -D wakusei
```

## OpenAPI to oRPC Code Generator

**Wakusei** generates type-safe [oRPC](https://orpc.dev/) code from [OpenAPI](https://www.openapis.org/) / [TypeSpec](https://typespec.io/) specifications.

- OpenAPI schemas to validation schemas (`zod` | `valibot` | `arktype`)
- [oRPC](https://orpc.dev/) procedures with `@orpc/server` or `@orpc/contract`
- Handler stubs with merge (preserves `.use()` middleware, handler bodies, `.callable()`)
- Vite plugin for automatic regeneration on spec changes

## Quick Start

Passing `-o <file>.ts` generates a single [`@orpc/contract`](https://orpc.dev/) file (**contract mode**). Omitting `-o` generates server handlers under `src/` (**server mode**). Everything else (`mode`, `template`, `components`, `pathAlias`, ...) lives in `wakusei.config.ts`.

```bash
npx wakusei openapi.yaml -o output.ts
```

### Contract Mode

input:

```yaml
openapi: 3.1.0
info:
  title: Wakusei API
  version: '1.0.0'
paths:
  /orpc:
    get:
      summary: Welcome
      description: Returns a welcome message from Wakusei.
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Message'
components:
  schemas:
    Message:
      type: object
      properties:
        message:
          type: string
      required:
        - message
```

output:

```ts
// output.ts
import { oc } from '@orpc/contract'
import * as z from 'zod'

export const MessageSchema = z.object({ message: z.string() })

export type MessageSchema = z.infer<typeof MessageSchema>

export const contract = {
  getOrpc: oc
    .route({
      method: 'GET',
      path: '/orpc',
      summary: 'Welcome',
      description: 'Returns a welcome message from Wakusei.',
    })
    .output(MessageSchema),
}
```

### Server Mode

```bash
npx wakusei openapi.yaml
```

output:

```ts
// src/components/index.ts
import * as z from 'zod'

export const MessageSchema = z.object({ message: z.string() })

export type MessageSchema = z.infer<typeof MessageSchema>
```

```ts
// src/handlers/orpc.ts
import { os } from '@orpc/server'
import { MessageSchema } from '../components'

export const getOrpc = os
  .route({
    method: 'GET',
    path: '/orpc',
    summary: 'Welcome',
    description: 'Returns a welcome message from Wakusei.',
  })
  .output(MessageSchema)
  .handler(async ({ input }) => {})
```

```ts
// src/handlers/index.ts
export * from './orpc'
```

## CLI

```bash
wakusei <input.{yaml,json,tsp}> [-o <output>] [--schema zod|valibot|arktype]
wakusei [--config <file>] [--watch]
```

| Invocation                              | What it does                                                          |
| --------------------------------------- | --------------------------------------------------------------------- |
| `wakusei openapi.yaml`                  | Server mode into `.` (`src/components`, `src/handlers`)               |
| `wakusei openapi.yaml -o api.ts`        | Contract mode, one module (`-o <dir>` writes `<dir>/src/contract.ts`) |
| `wakusei`                               | Runs `./wakusei.config.ts` (prints the usage when there is none)      |
| `wakusei --config config/api.config.ts` | Runs another config file (`-c` for short)                             |
| `wakusei --watch`                       | Runs the config, then again on every change (`-w` for short)          |

With `<input>`, no config file is read. `--config` cannot be combined with `<input>`, `--output` or `--schema`, and `--watch` runs a config file, so it cannot be combined with them either. The command also answers `--help`, `--version` and `--completions <shell>`.

### Watch mode

```bash
npx wakusei --watch
```

Reruns the config on every change to the input documents or to the config itself, and keeps watching when a run fails — a config that does not validate at startup included, so a typo does not end the session. Handler files are merged as on every run: add an operation and its stub appears, while the bodies already written stay put.

The whole directory holding the input document is watched, so a TypeSpec entry that imports its siblings and an external `$ref` both trigger a rerun. When an edit to the config moves `input` to another directory, the watcher follows it.

## Vite Plugin

Watches your OpenAPI spec and `wakusei.config.ts` for changes, then auto-regenerates code on save.

Requires `wakusei.config.ts` in your project root.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { wakuseiVite } from 'wakusei/vite-plugin'

export default defineConfig({
  plugins: [wakuseiVite()],
})
```

## Handler Merge

Re-running after updating your OpenAPI spec is safe — your hand-written code is preserved:

- `.use()` middleware chains — kept in their original positions
- Handler bodies — your implementation logic is kept
- `.callable()` / `.actionable()` — post-handler modifiers are preserved
- User-added imports — only generator-managed imports are updated

New routes are added as stubs. Deleted routes are removed, and a handler file no route maps to any more is deleted.

## Full Config Reference

`mode: 'contract'` writes an `@orpc/contract` router; `template` opts into `implement(contract)` stubs (rejected in server mode). `components.output` (one aggregate file) is mutually exclusive with the per-type fields (`schemas`, `responses`, ...). Server mode is the one-shot CLI (`wakusei openapi.yaml`) and does not need a config file.

`pathAlias`, `prefix` and `components.*.import` are checked here because they are spliced into the generated code verbatim: a quote, a backslash or whitespace would close a `'...'` literal early.

### Fields

| Field                   | Type                                  | Default        | Meaning                                                  |
| ----------------------- | ------------------------------------- | -------------- | -------------------------------------------------------- |
| `input`                 | `.yaml` / `.json` / `.tsp`            | required       | OpenAPI or TypeSpec entry document                       |
| `output`                | string                                | required       | Base directory, or a `.ts` file for one module           |
| `mode`                  | `'server'` \| `'contract'`            | required       | `@orpc/server` procedures, or an `@orpc/contract` router |
| `schema`                | `'zod'` \| `'valibot'` \| `'arktype'` | `'zod'`        | Validation library                                       |
| `format`                | oxfmt `FormatConfig`                  | omitted        | Formatter options for every generated file               |
| `readonly`              | boolean                               | `false`        | `as const` on generated component objects                |
| `prefix`                | string                                | omitted        | Prefix prepended to every generated route path           |
| `pathAlias`             | string                                | omitted        | Import prefix that stands for `<output>/src`             |
| `template`              | `{ output?: directory }`              | omitted        | Contract mode only: `implement(contract)` stubs          |
| `template.output`       | directory                             | `src/handlers` | Directory for those stubs                                |
| `exportSchemas`         | boolean                               | `false`        | Accepted; schema constants are always `export const`     |
| `exportSchemasTypes`    | boolean                               | `true`         | `export type` next to each schema                        |
| `exportResponses`       | boolean                               | `false`        | Generate `components.responses`                          |
| `exportParameters`      | boolean                               | `false`        | Generate `components.parameters`                         |
| `exportParametersTypes` | boolean                               | `false`        | `export type` next to each parameter schema              |
| `exportExamples`        | boolean                               | `false`        | Generate `components.examples`                           |
| `exportRequestBodies`   | boolean                               | `false`        | Generate `components.requestBodies`                      |
| `exportHeaders`         | boolean                               | `false`        | Generate `components.headers`                            |
| `exportHeadersTypes`    | boolean                               | `false`        | `export type` next to each header schema                 |
| `exportSecuritySchemes` | boolean                               | `false`        | Generate `components.securitySchemes`                    |
| `exportLinks`           | boolean                               | `false`        | Generate `components.links`                              |
| `exportCallbacks`       | boolean                               | `false`        | Generate `components.callbacks`                          |
| `exportPathItems`       | boolean                               | `false`        | Generate `components.pathItems`                          |
| `exportMediaTypes`      | boolean                               | `false`        | Generate `components.mediaTypes`                         |
| `exportMediaTypesTypes` | boolean                               | `false`        | `export type` next to each media type schema             |

### `components`

A kind configured here is generated even without its `export*` flag. `components.output` cannot sit next to any per-type field.

| Field                               | Type       | Default                              | Meaning                                            |
| ----------------------------------- | ---------- | ------------------------------------ | -------------------------------------------------- |
| `components.output`                 | `.ts` path | omitted                              | One file for the schemas and every flagged kind    |
| `components.schemas.output`         | string     | see below                            | File or directory for `components.schemas`         |
| `components.schemas.split`          | boolean    | `false`                              | One file per schema under `output`                 |
| `components.schemas.import`         | string     | omitted                              | Specifier handlers use for the schemas             |
| `components.responses.output`       | string     | `src/components/responses.ts`        | File or directory for `components.responses`       |
| `components.responses.import`       | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.parameters.output`      | string     | `src/components/parameters.ts`       | File or directory for `components.parameters`      |
| `components.parameters.import`      | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.headers.output`         | string     | `src/components/headers.ts`          | File or directory for `components.headers`         |
| `components.headers.import`         | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.examples.output`        | string     | `src/components/examples.ts`         | File or directory for `components.examples`        |
| `components.examples.import`        | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.requestBodies.output`   | string     | `src/components/request-bodies.ts`   | File or directory for `components.requestBodies`   |
| `components.requestBodies.import`   | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.securitySchemes.output` | string     | `src/components/security-schemes.ts` | File or directory for `components.securitySchemes` |
| `components.securitySchemes.import` | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.links.output`           | string     | `src/components/links.ts`            | File or directory for `components.links`           |
| `components.links.import`           | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.callbacks.output`       | string     | `src/components/callbacks.ts`        | File or directory for `components.callbacks`       |
| `components.callbacks.import`       | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.pathItems.output`       | string     | `src/components/path-items.ts`       | File or directory for `components.pathItems`       |
| `components.pathItems.import`       | string     | omitted                              | Specifier this file uses for the schemas           |
| `components.mediaTypes.output`      | string     | `src/components/media-types.ts`      | File or directory for `components.mediaTypes`      |
| `components.mediaTypes.import`      | string     | omitted                              | Specifier this file uses for the schemas           |

`components.schemas.output` defaults to `src/components/index.ts` when nothing else is generated, `src/components/schemas.ts` when other kinds have their own files, or a directory when `split` is `true`.

### Example

```ts
// wakusei.config.ts
import { defineConfig } from 'wakusei'

export default defineConfig({
  input: 'openapi.yaml', // OpenAPI or TypeSpec (.yaml, .json, .tsp)
  format: {}, // oxfmt FormatConfig; see https://www.npmjs.com/package/oxfmt
  output: '.', // base directory, or a .ts file for one module
  mode: 'contract', // 'server' | 'contract'
  schema: 'zod', // 'zod' | 'valibot' | 'arktype'
  template: { output: 'src/handlers' }, // contract only; rejected in server mode
  readonly: false, // as const on generated component objects
  prefix: '/api/v1', // prepended to every generated route path
  pathAlias: '@/', // import prefix for <output>/src

  // Export options (OpenAPI Components Object)
  exportSchemas: true, // schema constants stay export const (handlers import them)
  exportSchemasTypes: true, // export type for each schema (default true)
  exportResponses: true, // generate components.responses
  exportParameters: true, // generate components.parameters
  exportParametersTypes: true, // export type for each parameter schema
  exportExamples: true, // generate components.examples
  exportRequestBodies: true, // generate components.requestBodies
  exportHeaders: true, // generate components.headers
  exportHeadersTypes: true, // export type for each header schema
  exportSecuritySchemes: true, // generate components.securitySchemes
  exportLinks: true, // generate components.links
  exportCallbacks: true, // generate components.callbacks
  exportPathItems: true, // generate components.pathItems
  exportMediaTypes: true, // generate components.mediaTypes
  exportMediaTypesTypes: true, // export type for each media type schema

  // Per-type outputs. Mutually exclusive with `components.output`
  // (that one file would hold the schemas and every flagged kind).
  components: {
    // output: 'src/components/index.ts',
    schemas: {
      output: 'src/schemas', // file, or a directory when split is true
      split: true, // one file per schema
      import: '@/schemas', // specifier handlers use
    },
    responses: {
      output: 'src/components/responses.ts',
      import: '@/schemas',
    },
    parameters: {
      output: 'src/components/parameters.ts',
      import: '@/schemas',
    },
    headers: {
      output: 'src/components/headers.ts',
      import: '@/schemas',
    },
    examples: {
      output: 'src/components/examples.ts',
    },
    requestBodies: {
      output: 'src/components/request-bodies.ts',
      import: '@/schemas',
    },
    securitySchemes: {
      output: 'src/components/security-schemes.ts',
    },
    links: {
      output: 'src/components/links.ts',
    },
    callbacks: {
      output: 'src/components/callbacks.ts',
      import: '@/schemas',
    },
    pathItems: {
      output: 'src/components/path-items.ts',
      import: '@/schemas',
    },
    mediaTypes: {
      output: 'src/components/media-types.ts',
      import: '@/schemas',
    },
  },
})
```

Unknown keys are rejected, and an invalid config names the field (`Invalid config: schema: Expected "zod" | "valibot" | "arktype"`).

## Contributing

If you find any issues or have suggestions, please open an issue at [GitHub Issues](https://github.com/nakita628/wakusei/issues).

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/wakusei?tab=MIT-1-ov-file) for more information.
