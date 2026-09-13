# Wakusei

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
wakusei [--config <file>]
```

| Invocation                              | What it does                                                          |
| --------------------------------------- | --------------------------------------------------------------------- |
| `wakusei openapi.yaml`                  | Server mode into `.` (`src/components`, `src/handlers`)               |
| `wakusei openapi.yaml -o api.ts`        | Contract mode, one module (`-o <dir>` writes `<dir>/src/contract.ts`) |
| `wakusei`                               | Runs `./wakusei.config.ts` (prints the usage when there is none)      |
| `wakusei --config config/api.config.ts` | Runs another config file (`-c` for short)                             |

With `<input>`, no config file is read. `--config` cannot be combined with `<input>`, `--output` or `--schema`. The command also answers `--help`, `--version` and `--completions <shell>`.

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

```ts
// wakusei.config.ts
import { defineConfig } from 'wakusei/config'

export default defineConfig({
  // OpenAPI spec file (.yaml, .json, or .tsp)
  input: 'openapi.yaml',

  // oxfmt FormatConfig for generated code output
  // @see https://www.npmjs.com/package/oxfmt
  // format: {},

  // Base directory of the generated tree, or a .ts file for single-file output
  output: '.',

  // Generation mode: 'server' uses @orpc/server, 'contract' uses @orpc/contract.
  // In 'server' mode handlers are written under `output`; `template` is contract-only.
  mode: 'server', // 'server' | 'contract'

  // Schema library for validation
  schema: 'zod', // 'zod' | 'valibot' | 'arktype'

  // Contract mode only: opt into handler stubs and choose their directory.
  // Setting `template` in 'server' mode is rejected.
  // template: { output: 'src/handlers' },

  // Add 'as const' to generated component objects
  readonly: false,

  // Prefix for all generated route paths (e.g. '/api/v1')
  // prefix: '/api/v1',

  // Import path alias for the generated `src` directory. Schema/component imports
  // resolve against it so they are import-site independent (e.g. '@/components').
  // pathAlias: '@/',

  // Export component flags (OpenAPI Components Object). A flagged kind is generated;
  // without `components.output` each one gets its own file.
  exportResponses: true,
  exportParameters: true,
  exportParametersTypes: true,
  exportExamples: true,
  exportRequestBodies: true,
  exportHeaders: true,
  exportHeadersTypes: true,
  exportSecuritySchemes: true,
  exportLinks: true,
  exportCallbacks: true,
  exportPathItems: true,
  exportMediaTypes: true,
  exportMediaTypesTypes: true,

  // Where components go (OpenAPI Components Object). A kind configured here is
  // generated even without its flag. `output` (single aggregate file) is mutually
  // exclusive with the per-type fields below (schemas, responses, ...).
  components: {
    // Single-file mode: emit the schemas and every flagged kind into one file.
    // output: 'src/components/index.ts',

    // Schemas (OpenAPI components.schemas). Default: 'src/components/index.ts' when no
    // other kind is generated, 'src/components/schemas.ts' otherwise. `split` emits one
    // file per schema under `output`, and `import` overrides the path handlers use.
    schemas: {
      output: 'src/schemas', // Output directory (or file) for schemas
      split: true, // Generate one file per schema
      import: '@/schemas', // Import path alias for handlers to reference schemas
    },
    responses: {
      output: 'src/components/responses.ts', // Output file path
      import: '@/schemas', // Import path for schema references
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
