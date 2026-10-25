import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect, FileSystem, Schema, SchemaIssue } from 'effect'
import type { FormatConfig } from 'oxfmt'

/** Config file `wakusei` picks up from the working directory when `--config` is omitted. */
export const DEFAULT_CONFIG_FILE = 'wakusei.config.ts'

/** Every `components.*` key other than `output`, the single-file aggregate. */
const COMPONENT_KINDS = [
  'schemas',
  'responses',
  'parameters',
  'headers',
  'examples',
  'requestBodies',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
  'mediaTypes',
] as const

/**
 * `Schema.TemplateLiteral` carries the literal type but its rejection reads "Expected a
 * string matching template literal parts"; `Schema.declare` over the same guard keeps the
 * type on both sides — so `defineConfig` still rejects a wrong extension while you type —
 * and lets the message say which extensions are meant.
 */
const InputSchema = Schema.declare<`${string}.yaml` | `${string}.json` | `${string}.tsp`>(
  Schema.is(Schema.TemplateLiteral([Schema.String, Schema.Literals(['.yaml', '.json', '.tsp'])])),
  { message: 'must be .yaml | .json | .tsp' },
).annotate({
  title: 'Input document',
  description: 'OpenAPI or TypeSpec entry document.',
  examples: ['openapi.yaml', './spec/main.tsp'],
})

const TypeScriptPathSchema = Schema.declare<`${string}.ts`>(
  Schema.is(Schema.TemplateLiteral([Schema.NonEmptyString, '.ts'])),
  { message: 'must be .ts file' },
)

const DirectorySchema = Schema.String.check(
  Schema.isPattern(/^(?!.*\.ts$).+/u, { message: 'must be a directory, not a .ts file' }),
)

/**
 * Anything below that is spliced into a generated `'...'` literal — a module
 * specifier, a path alias, a route prefix — has to survive the trip as one token.
 *
 * Neither the schema nor the generators quote what they interpolate, so a value
 * carrying a quote, a backslash or a newline closes the literal early and the
 * failure lands on oxfmt as a syntax error about the generated file. Rejecting the
 * value here names the config field instead.
 */
const SAFE_IN_STRING_LITERAL = /^[^\s'"`\\]+$/u

/**
 * `import` named the specifier one output was imported by. A generated file now works the
 * specifier out itself, so the key is refused with where that rule lives.
 */
const RemovedImportSchema = Schema.Never.annotate({
  message:
    'import was removed: a generated file imports the schemas relatively, under pathAlias inside `<output>/src`, or by `package` from another package.',
})

const PackageSchema = Schema.String.check(
  Schema.isPattern(SAFE_IN_STRING_LITERAL, {
    message: 'must be a module specifier, with no whitespace or quotes',
  }),
).annotate({
  title: 'Package name',
  description:
    'Module the generated files of other packages import the schemas from: the name of the package they are written into. Files in the same package import them relatively, or under `pathAlias`.',
  examples: ['@packages/schemas'],
})

const PathAliasSchema = Schema.String.check(
  Schema.isPattern(SAFE_IN_STRING_LITERAL, {
    message: 'must be an import prefix, with no whitespace or quotes',
  }),
).annotate({
  title: 'Path alias',
  description:
    'Import prefix used instead of relative paths; stands for `<output>/src`. Only a file in the package of `<output>/src` imports by it.',
  examples: ['@/', '~/'],
})

const PrefixSchema = Schema.String.check(
  Schema.isPattern(SAFE_IN_STRING_LITERAL, {
    message: 'must be a path prefix, with no whitespace or quotes',
  }),
).annotate({
  title: 'Route prefix',
  description: 'Prefix prepended to every generated route path.',
  examples: ['/api/v1', '/v1'],
})

/** An `export*` flag: off unless the config turns it on. */
const FlagSchema = Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false)))

function exportFlag(description: string) {
  return FlagSchema.annotate({ description })
}

/**
 * Every per-type output is the same two-branch union: `split: true` writes one file
 * per entry into a directory, anything else writes a single file.
 *
 * `Schema.Union` resolves members in order and each member pins `split` to a literal, so
 * a member is only reachable through its own discriminant — the failure reported is the
 * one inside the matching branch, not a union-wide "no member matched".
 */
function splitUnion<Shared extends Schema.Struct.Fields>(shared: Shared) {
  return Schema.Union([
    Schema.Struct({
      split: Schema.Literal(true).annotate({
        description: 'Write one file per entry into `output`.',
      }),
      output: Schema.String.check(
        Schema.isPattern(/^(?!.*\.ts$).+/u, {
          message: 'split mode requires directory, not .ts file',
        }),
      ).annotate({
        title: 'Output directory',
        description:
          'Directory that receives one file per generated entry. Never a `.ts` file path.',
        examples: ['src/schemas', 'src/components/responses'],
      }),
      ...shared,
    }),
    Schema.Struct({
      split: Schema.Literal(false)
        .pipe(Schema.withDecodingDefaultKey(Effect.succeed(false)))
        .annotate({ description: 'Write every entry into a single file (default).' }),
      output: Schema.NonEmptyString.annotate({
        title: 'Component output',
        description: 'File or directory for this Components kind. A directory becomes `index.ts`.',
        examples: ['src/components/responses.ts', 'src/responses'],
      }),
      ...shared,
    }),
  ])
}

const OutputSchema = splitUnion({
  import: Schema.optionalKey(RemovedImportSchema),
}).annotate({
  title: 'Generated output target',
  description:
    'Where one group of generated code is written. `split` picks directory mode or single-file mode.',
  examples: [
    { split: false, output: 'src/responses.ts' },
    { split: true, output: 'src/responses' },
  ],
})

const exportTypesFields = {
  import: Schema.optionalKey(RemovedImportSchema),
  exportTypes: FlagSchema.annotate({
    description: 'Also export the TypeScript type inferred from each generated schema.',
  }),
}

const ExportTypesOutputSchema = splitUnion(exportTypesFields).annotate({
  title: 'Generated output target with type exports',
  description:
    'Same as a generated output target, plus `exportTypes` for schemas, parameters, headers and mediaTypes.',
  examples: [
    { split: false, output: 'src/schemas.ts', exportTypes: true },
    { split: true, output: 'src/parameters', exportTypes: true },
  ],
})

/** `components.schemas`: the one output every other generated file imports. */
const SchemasOutputSchema = splitUnion({
  ...exportTypesFields,
  package: Schema.optionalKey(PackageSchema),
}).annotate({
  title: 'Schemas output target',
  description:
    'Where `components.schemas` is written. `package` names the package it is written into, for the generated files of other packages.',
  examples: [
    { split: false, output: 'src/schemas.ts', exportTypes: true },
    {
      split: true,
      output: 'packages/schemas/src',
      package: '@packages/schemas',
      exportTypes: false,
    },
  ],
})

const ComponentsSchema = Schema.Struct({
  output: Schema.optionalKey(
    TypeScriptPathSchema.annotate({
      title: 'Aggregate components file',
      description:
        'Single file for the schemas and every flagged kind. Mutually exclusive with the per-type fields.',
      examples: ['src/components/index.ts'],
    }),
  ),
  package: Schema.optionalKey(
    PackageSchema.annotate({
      description:
        'Module the generated files of other packages import `output` from: the name of the package it is written into. Goes with `output`; per-type outputs name it on `schemas`.',
      examples: ['@packages/components'],
    }),
  ),
  schemas: Schema.optionalKey(SchemasOutputSchema),
  responses: Schema.optionalKey(OutputSchema),
  parameters: Schema.optionalKey(ExportTypesOutputSchema),
  examples: Schema.optionalKey(OutputSchema),
  requestBodies: Schema.optionalKey(OutputSchema),
  headers: Schema.optionalKey(ExportTypesOutputSchema),
  securitySchemes: Schema.optionalKey(OutputSchema),
  links: Schema.optionalKey(OutputSchema),
  callbacks: Schema.optionalKey(OutputSchema),
  pathItems: Schema.optionalKey(OutputSchema),
  mediaTypes: Schema.optionalKey(ExportTypesOutputSchema),
})
  .check(
    Schema.makeFilter(
      (components) =>
        components.output === undefined ||
        COMPONENT_KINDS.every((kind) => components[kind] === undefined),
      {
        message:
          'components.output is mutually exclusive with per-type component outputs (schemas, responses, parameters, ...). Use output for single-file mode, or per-type fields for split mode.',
      },
    ),
  )
  .check(
    Schema.makeFilter(
      (components) => components.package === undefined || components.output !== undefined,
      {
        message:
          'components.package goes with components.output; with per-type outputs, set components.schemas.package.',
      },
    ),
  )
  .annotate({
    title: 'Components output',
    description:
      'Destination for `components`. Either `output` (with its `package`) for one file, or per-type fields that each get their own target. Each per-type field takes `split`; schemas, parameters, headers and mediaTypes also take `exportTypes`, and schemas takes `package`.',
    examples: [
      { output: 'src/components/index.ts' },
      {
        schemas: {
          split: true,
          output: 'packages/schemas/src',
          package: '@packages/schemas',
          exportTypes: true,
        },
        responses: { split: true, output: 'src/responses' },
      },
    ],
  })

const EnvironmentVariableSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/u, {
    message: 'must be the name of an environment variable',
  }),
)

/**
 * The names the client file binds itself; the environment object a module of yours exports
 * is imported under its own name, so it cannot be one of them.
 */
const CLIENT_OWN_NAMES = [
  'client',
  'Client',
  'contract',
  'createORPCClient',
  'ContractRouterClient',
  'OpenAPILink',
]

const ClientSchema = Schema.Struct({
  output: Schema.optionalKey(
    TypeScriptPathSchema.annotate({
      title: 'Client output file',
      description:
        'Where the client is written, resolved against `output` (the working directory when `output` is a `.ts` file). Defaults to `src/client.ts`.',
      examples: ['src/client.ts'],
    }),
  ),
  baseUrl: Schema.Union([
    // `/` is the default and the only URL written into the file: a fixed URL differs
    // between environments, so it is read from the environment instead.
    Schema.String.check(
      Schema.isPattern(/^\/$/u, {
        message:
          "a fixed URL is not taken: leave baseUrl out (or set '/') for the same origin, or read it from the environment with { env } or { env, import }",
      }),
    ),
    // One object for both environment forms, told apart by `import`: as two union members,
    // a mistake in one (`source: 'window'`) would be reported as an excess key of the other.
    Schema.Struct({
      env: EnvironmentVariableSchema.annotate({
        title: 'Environment variable',
        description:
          'The variable that holds the base URL, asserted present with `!` (`VITE_API_URL` for a Vite build, `API_URL` for Node.js), or with `import`, the property of the imported environment object (`API_URL` for `env.API_URL`).',
        examples: ['VITE_API_URL', 'API_URL'],
      }),
      source: Schema.optionalKey(
        Schema.Literals(['import.meta.env', 'process.env']).annotate({
          title: 'Where the variable is read from',
          description:
            '`import.meta.env` (the default) for code a bundler such as Vite builds, `process.env` for code Node.js runs. Not with `import`.',
          examples: ['import.meta.env', 'process.env'],
        }),
      ),
      import: Schema.optionalKey(
        Schema.String.check(
          Schema.isPattern(SAFE_IN_STRING_LITERAL, {
            message: 'must be a module specifier, with no whitespace or quotes',
          }),
        ).annotate({
          title: 'Import specifier',
          description:
            'The module of yours that exports the environment object, written into the client file as it stands: `@/env`, `../env`.',
          examples: ['@/env', '../env'],
        }),
      ),
      name: Schema.optionalKey(
        Schema.String.check(
          Schema.isPattern(/^[A-Za-z_$][\w$]*$/u, { message: 'must be a JavaScript identifier' }),
          Schema.makeFilter((name) => !CLIENT_OWN_NAMES.includes(name), {
            message: `must not be a name the client file binds itself (${CLIENT_OWN_NAMES.join(', ')})`,
          }),
        ).annotate({
          title: 'Environment export name',
          description:
            'The named export of `import` that is the environment object, `env` when left out.',
          examples: ['env'],
        }),
      ),
    }).check(
      Schema.makeFilter((url) => url.import === undefined || url.source === undefined, {
        message:
          'source goes with { env } alone: with import, the property is read from the environment object the module exports',
      }),
      Schema.makeFilter((url) => url.import !== undefined || url.name === undefined, {
        message: 'name goes with { env, import }: it is the export of import to read env from',
      }),
    ),
  ])
    .pipe(Schema.withDecodingDefault(Effect.succeed('/')))
    .annotate({
      title: 'Base URL',
      description:
        'The `url` of the `OpenAPILink`. `/` (the default) is the origin of the page, `location.origin`, read on every request. `{ env }` reads an environment variable, `import.meta.env.VITE_API_URL!` or `process.env.API_URL!` with `source: "process.env"`. `{ env, import }` reads a property of an environment object a module of yours exports, `env.API_URL` from `@/env`.',
      examples: [
        '/',
        { env: 'VITE_API_URL', source: 'import.meta.env' },
        { env: 'API_URL', import: '@/env', name: 'env' },
      ],
    }),
  credentials: Schema.optionalKey(
    Schema.Literals(['include', 'same-origin', 'omit']).annotate({
      title: 'Credentials',
      description:
        'The `credentials` of every request the client sends, passed to `fetch`. `include` sends the cookies to another origin as well. Left out, nothing is written and the browser decides.',
      examples: ['include'],
    }),
  ),
  import: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(SAFE_IN_STRING_LITERAL, {
        message: 'must be a module specifier, with no whitespace or quotes',
      }),
    ).annotate({
      title: 'Contract import specifier',
      description:
        'Module the client imports `contract` from. Left out, the contract is imported relatively, or under `pathAlias`. Name the package of the contract when the client is written into another package.',
      examples: ['@packages/contract'],
    }),
  ),
}).annotate({
  title: 'Typed client',
  description:
    'An oRPC client of the contract over `OpenAPILink`, exported as `client` with its type as `Client`. Rejected in server mode.',
  examples: [
    { output: 'src/client.ts', baseUrl: '/' },
    { output: 'src/client.ts', baseUrl: { env: 'API_URL', source: 'process.env' } },
    {
      output: '../web/src/client.ts',
      baseUrl: '/',
      import: '@packages/api',
      credentials: 'include',
    },
  ],
})

/** Fields both modes share. `template` and `client` belong to the contract variant alone. */
const sharedFields = {
  input: InputSchema,
  format: Schema.optionalKey(
    Schema.declare<FormatConfig>(
      (u): u is FormatConfig => typeof u === 'object' && u !== null && !Array.isArray(u),
      {
        message: 'must be an oxfmt FormatConfig object',
        description: 'oxfmt `FormatConfig` applied to every generated file.',
      },
    ),
  ),
  output: Schema.NonEmptyString.annotate({
    description: 'Base directory of the generated tree, or a `.ts` file for single-file output.',
  }),
  readonly: FlagSchema.annotate({
    description: 'Emit `as const` on generated component objects.',
  }),
  pathAlias: Schema.optionalKey(PathAliasSchema),
  schema: Schema.Literals(['zod', 'valibot', 'arktype'])
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed('zod' as const)))
    .annotate({
      title: 'Schema library',
      description: 'Validation library for generated schemas.',
      examples: ['zod', 'valibot', 'arktype'],
    }),
  prefix: Schema.optionalKey(PrefixSchema),
  exportSchemas: exportFlag(
    'Re-export `components.schemas`. Schema constants are always `export const` because handlers import them.',
  ),
  // Default on: today's generated output always ships the inferred type next to each schema.
  exportSchemasTypes: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(true)),
  ).annotate({
    description: 'Also export the TypeScript type inferred from each `components.schemas` entry.',
  }),
  exportResponses: exportFlag('Generate `components.responses`.'),
  exportParameters: exportFlag('Generate `components.parameters`.'),
  exportParametersTypes: exportFlag(
    'Also export the TypeScript type inferred from each `components.parameters` entry.',
  ),
  exportExamples: exportFlag('Generate `components.examples`.'),
  exportRequestBodies: exportFlag('Generate `components.requestBodies`.'),
  exportHeaders: exportFlag('Generate `components.headers`.'),
  exportHeadersTypes: exportFlag(
    'Also export the TypeScript type inferred from each `components.headers` entry.',
  ),
  exportSecuritySchemes: exportFlag('Generate `components.securitySchemes`.'),
  exportLinks: exportFlag('Generate `components.links`.'),
  exportCallbacks: exportFlag('Generate `components.callbacks`.'),
  exportPathItems: exportFlag('Generate `components.pathItems`.'),
  exportMediaTypes: exportFlag('Generate `components.mediaTypes`.'),
  exportMediaTypesTypes: exportFlag(
    'Also export the TypeScript type inferred from each `components.mediaTypes` entry.',
  ),
  components: Schema.optionalKey(ComponentsSchema),
}

/**
 * `mode` pins each member, so a config is checked against the variant it names: a
 * `server` config that sets `template` fails on `template`, not on `mode`.
 */
const ConfigSchema = Schema.Union([
  Schema.Struct({
    mode: Schema.Literal('server').annotate({
      description:
        'Generate `@orpc/server` procedures. The CLI one-shot (`wakusei openapi.yaml`) uses this mode.',
    }),
    ...sharedFields,
  }),
  Schema.Struct({
    mode: Schema.Literal('contract').annotate({
      description: 'Generate an `@orpc/contract` router.',
    }),
    ...sharedFields,
    template: Schema.optionalKey(
      Schema.Struct({
        output: Schema.optionalKey(
          DirectorySchema.annotate({
            title: 'Handler directory',
            description:
              'Directory for `implement(contract)` stubs. Defaults to `src/handlers` when omitted.',
            examples: ['src/handlers'],
          }),
        ),
      }).annotate({
        title: 'Contract template',
        description: 'Opt into `implement(contract)` stubs. Rejected in server mode.',
      }),
    ),
    client: Schema.optionalKey(ClientSchema),
  }),
]).annotate({ title: 'wakusei config' })

/** A validated config: every flag and the schema library filled in. */
export type Config = typeof ConfigSchema.Type

/**
 * The config file is missing, will not import, or does not validate.
 *
 * `notFound` separates "there is no config here" from "the config here is wrong": only
 * the first is the caller who ran `wakusei` with nothing and needs the usage.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- `Schema.TaggedError()` is the class factory, not a throw
export class ConfigError extends Schema.TaggedError<ConfigError>()('ConfigError', {
  message: Schema.String,
  notFound: Schema.optionalKey(Schema.Boolean),
}) {}

// Built once and reused at the edge rather than per call. Unknown keys are rejected: a
// misspelled field would otherwise be dropped silently and its generator never run.
const decodeConfig = Schema.decodeUnknownEffect(ConfigSchema, { onExcessProperty: 'error' })
// A union no member matches reports every member's shape. `mode` is what picks the member,
// so it is decoded on its own first and a missing or unknown mode reads as one field.
const decodeMode = Schema.decodeUnknownEffect(
  Schema.Struct({ mode: Schema.Literals(['server', 'contract']) }),
)
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1()

/**
 * Validates an already-loaded config object. The first issue is reported as
 * `<a.b.c>: <message>`: a config is written by hand, so naming the field matters more
 * than listing every consequence of it.
 */
export function parseConfig(config: unknown) {
  return Effect.gen(function* () {
    yield* decodeMode(config)
    return yield* decodeConfig(config)
  }).pipe(
    Effect.mapError((error) => {
      const issue = formatIssue(error.issue).issues[0]
      const path = (issue?.path ?? [])
        .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
        .join('.')
      const prefix = path === '' ? '' : `${path}: `
      return new ConfigError({ message: `Invalid config: ${prefix}${issue?.message ?? ''}` })
    }),
  )
}

// A module specifier is imported once per process, so a reload of the same config file
// would get the copy from before the edit. The counter makes each reload a new specifier.
let reloadCount = 0

/**
 * Loads and validates a config file, resolved against the current directory. `reload`
 * re-reads a config that has already been imported.
 */
export function readConfig(configPath: string = DEFAULT_CONFIG_FILE, reload = false) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const abs = resolve(process.cwd(), configPath)
    // Checked before importing so a missing file reads as "no config here" rather than
    // as whatever the module loader throws.
    const found = yield* fs
      .exists(abs)
      .pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false)))
    if (!found) {
      return yield* new ConfigError({
        message: `Config not found: ${abs}\nCreate ${DEFAULT_CONFIG_FILE} in the current directory, or pass <input>. See https://github.com/nakita628/wakusei#full-config-reference for an example.`,
        notFound: true,
      })
    }
    const href = pathToFileURL(abs).href
    const specifier = reload ? `${href}?reload=${String((reloadCount += 1))}` : href
    const mod: unknown = yield* Effect.tryPromise({
      // The specifier is a runtime file URL, so a bundler's import analysis has nothing
      // to resolve.
      try: () => import(/* @vite-ignore */ specifier),
      catch: (error) =>
        new ConfigError({ message: error instanceof Error ? error.message : String(error) }),
    })
    // `'default' in mod` is what narrows `mod` for TypeScript; `export default undefined`
    // leaves the key present, which is why both halves are here.
    if (
      typeof mod !== 'object' ||
      mod === null ||
      !('default' in mod) ||
      mod.default === undefined
    ) {
      return yield* new ConfigError({
        message: `Config must export default object from ${abs}\nDid you forget \`export default defineConfig({ ... })\`?`,
      })
    }
    return yield* parseConfig(mod.default)
  })
}

export function defineConfig(config: typeof ConfigSchema.Encoded) {
  return config
}
