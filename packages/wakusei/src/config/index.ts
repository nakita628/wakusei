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

const ImportSchema = Schema.String.check(
  Schema.isPattern(SAFE_IN_STRING_LITERAL, {
    message: 'must be a module specifier, with no whitespace or quotes',
  }),
).annotate({
  title: 'Import specifier',
  description: 'Module specifier generated files use to import this output.',
  examples: ['@/schemas', '../schemas', '.'],
})

const PathAliasSchema = Schema.String.check(
  Schema.isPattern(SAFE_IN_STRING_LITERAL, {
    message: 'must be an import prefix, with no whitespace or quotes',
  }),
).annotate({
  title: 'Path alias',
  description: 'Import prefix used instead of relative paths; stands for `<output>/src`.',
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

const ComponentSchema = Schema.Struct({
  output: Schema.NonEmptyString.annotate({
    title: 'Component output',
    description: 'File or directory for this Components kind.',
    examples: ['src/components/responses.ts'],
  }),
  import: Schema.optionalKey(ImportSchema),
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
  schemas: Schema.optionalKey(
    Schema.Struct({
      ...ComponentSchema.fields,
      split: Schema.optionalKey(
        Schema.Boolean.annotate({
          description: 'Write one file per schema under `output`.',
        }),
      ),
    }).annotate({
      title: 'Schemas output',
      description: 'Where `components.schemas` are written.',
    }),
  ),
  responses: Schema.optionalKey(ComponentSchema),
  parameters: Schema.optionalKey(ComponentSchema),
  headers: Schema.optionalKey(ComponentSchema),
  examples: Schema.optionalKey(ComponentSchema),
  requestBodies: Schema.optionalKey(ComponentSchema),
  securitySchemes: Schema.optionalKey(ComponentSchema),
  links: Schema.optionalKey(ComponentSchema),
  callbacks: Schema.optionalKey(ComponentSchema),
  pathItems: Schema.optionalKey(ComponentSchema),
  mediaTypes: Schema.optionalKey(ComponentSchema),
}).check(
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

/** Fields both modes share. `template` belongs to the contract variant alone. */
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
