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

```ts
// wakusei.config.ts
import { defineConfig } from 'wakusei'

export default defineConfig({
  // OpenAPI or TypeSpec entry document (.yaml, .json, .tsp)
  input: 'openapi.yaml',

  // oxfmt FormatConfig for every generated file
  // @see https://www.npmjs.com/package/oxfmt
  format: {},

  // Base directory of the generated tree, or a .ts file for one module
  output: '.',

  // 'server' | 'contract'. 'server' is the CLI one-shot (`wakusei openapi.yaml`)
  mode: 'contract',

  // Validation library: 'zod' | 'valibot' | 'arktype' (default 'zod')
  schema: 'zod',

  // Contract mode only: implement(contract) stubs (default directory src/handlers)
  template: { output: 'src/handlers' },

  // as const on generated component objects (default false)
  readonly: false,

  // Prefix prepended to every generated route path
  prefix: '/api/v1',

  // Import prefix that stands for <output>/src
  pathAlias: '@/',

  // Export options (OpenAPI Components Object). A flagged kind is generated;
  // without components.output each one gets its own file. *Types adds
  // export type next to each schema, parameter, header or media type.
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

  // Where components go. A kind configured here is generated even without
  // its flag. output (one aggregate .ts file) is mutually exclusive with
  // the per-type fields. schemas.output defaults to src/components/index.ts
  // when nothing else is generated, src/components/schemas.ts otherwise,
  // or a directory when split is true.
  components: {
    // output: 'src/components/index.ts',
    schemas: {
      output: 'src/schemas',
      split: true,
      import: '@/schemas',
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
