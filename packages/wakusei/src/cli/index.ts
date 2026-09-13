import { fileURLToPath } from 'node:url'

import { Console, Effect, FileSystem, Option, Runtime, Schema } from 'effect'
import { Argument, CliError, CliOutput, Command, Flag } from 'effect/unstable/cli'

import type { Config } from '../config/index.js'
import { DEFAULT_CONFIG_FILE, parseConfig, readConfig } from '../config/index.js'

const COMMAND_NAME = 'wakusei'

// `Schema.refine` both rejects the value at runtime and narrows the parsed type. The
// template literal alone would do the same check but reports "Expected a string matching
// template literal parts"; refining with `Schema.is` of it is what buys the sentence below.
const DocumentPathSchema = Schema.String.pipe(
  Schema.refine(
    Schema.is(Schema.TemplateLiteral([Schema.String, Schema.Literals(['.yaml', '.json', '.tsp'])])),
    { message: 'an OpenAPI (.yaml, .json) or TypeSpec (.tsp) document' },
  ),
)

/** What `wakusei` accepts; each value is decoded before {@link generate} sees it. */
const commandLine = {
  input: Argument.file('input', { mustExist: true }).pipe(
    Argument.withSchema(DocumentPathSchema),
    Argument.withDescription('OpenAPI (.yaml, .json) or TypeSpec (.tsp) document to generate from'),
    Argument.withMetavar('input.{yaml,json,tsp}'),
    Argument.optional,
  ),
  // `Flag.string`, not `Flag.file`: the file primitive rewrites its value to an absolute
  // path, and `--output` is echoed back in the report, which should read as typed.
  output: Flag.string('output').pipe(
    Flag.withAlias('o'),
    Flag.withDescription(
      'Contract mode: a .ts file for a single module, or a directory (without -o: server mode into .)',
    ),
    Flag.withMetavar('output'),
    Flag.optional,
  ),
  schema: Flag.choice('schema', ['zod', 'valibot', 'arktype']).pipe(
    Flag.withDescription('Validation library for <input> (default: zod)'),
    Flag.withMetavar('lib'),
    Flag.optional,
  ),
  config: Flag.file('config', { mustExist: true }).pipe(
    Flag.withAlias('c'),
    Flag.withDescription(`Config file to run (default: ./${DEFAULT_CONFIG_FILE})`),
    Flag.withMetavar('file'),
    Flag.optional,
  ),
} as const

/** A command line that describes neither mode: answered with the usage and why. */
function showHelp(message: string) {
  return new CliError.ShowHelp({
    commandPath: [COMMAND_NAME],
    errors: [new CliError.UserError({ cause: new Error(message), userMessage: message })],
  })
}

/**
 * Everything the command does once the command line has parsed.
 *
 * Two modes. An `<input>` is the one-shot: `-o` switches it from server mode (handlers
 * under `.`) to contract mode, and no config file is consulted even when one sits in
 * the working directory. Without `<input>`, a config file runs — which is what opts in
 * everything else (`template`, `components`, `pathAlias`, `format`, ...).
 *
 * The generator pipeline pulls in the OpenAPI parser, the TypeSpec compiler and ts-morph.
 * `--help`, `--version`, `--completions` and every rejected command line must not pay for
 * that, so it is loaded here rather than at module scope.
 */
function generate(args: Command.Command.Config.Infer<typeof commandLine>) {
  return Effect.gen(function* () {
    const input = Option.getOrUndefined(args.input)
    const output = Option.getOrUndefined(args.output)
    const schema = Option.getOrUndefined(args.schema)
    const configPath = Option.getOrUndefined(args.config)

    if (configPath !== undefined && (input ?? output ?? schema) !== undefined) {
      return yield* showHelp(
        '--config cannot be combined with <input>, --output or --schema. A config file already names its own input and outputs.',
      )
    }
    if (input === undefined && (output ?? schema) !== undefined) {
      return yield* showHelp('--output and --schema need an <input> document.')
    }

    const config: Config =
      input === undefined
        ? yield* readConfig(configPath).pipe(
            // A config that is absent and was never asked for is the "ran `wakusei` with
            // nothing" case, the one place where the usage block is the answer. A config
            // that is present and wrong already names the field.
            Effect.mapError((error) =>
              configPath === undefined && error.notFound === true
                ? new CliError.ShowHelp({
                    commandPath: [COMMAND_NAME],
                    errors: [new CliError.UserError({ cause: error, userMessage: error.message })],
                  })
                : error,
            ),
          )
        : yield* parseConfig({
            input,
            output: output ?? '.',
            mode: output === undefined ? 'server' : 'contract',
            schema: schema ?? 'zod',
          })
    const { orpc } = yield* Effect.promise(() => import('../core/index.js'))
    yield* orpc(config)
    return yield* Console.log(
      `🪐 wakusei: ${config.input} → ${config.output} (${config.mode}, ${config.schema}) ✅`,
    )
  }).pipe(
    // A `CliError` is already something the runner knows how to render — `ShowHelp` in
    // particular. Everything else is a config, generator or filesystem failure that only
    // carries a sentence.
    Effect.mapError((error) =>
      CliError.isCliError(error)
        ? error
        : new CliError.UserError({ cause: error, userMessage: error.message }),
    ),
  )
}

/**
 * The `wakusei` command: parsing, validation, `--help`, `--version` and shell completions
 * are owned by `effect/unstable/cli`, {@link generate} is the rest.
 */
const cli = Command.make(COMMAND_NAME, commandLine, generate).pipe(
  Command.withDescription('Generate oRPC code from an OpenAPI or TypeSpec document'),
  Command.withExamples([
    {
      command: `${COMMAND_NAME} openapi.yaml`,
      description: 'Generate server handlers and components under ./src',
    },
    {
      command: `${COMMAND_NAME} openapi.yaml -o src/contract.ts`,
      description: 'Generate a single @orpc/contract module',
    },
    {
      command: COMMAND_NAME,
      description: `Run ./${DEFAULT_CONFIG_FILE}`,
    },
    {
      command: `${COMMAND_NAME} --config config/api.config.ts`,
      description: 'Run a config file from another location',
    },
  ]),
)

/**
 * The version could not be read: the manifest beside the entry is missing, is not JSON,
 * or carries no `version` — a broken install, not anything the caller typed. It is raised
 * before the command runs, so it is rendered here through the same formatter and marked as
 * reported, so `runMain` does not print it a second time.
 */
function reportBrokenInstall(cause: { readonly message: string }) {
  return Effect.gen(function* () {
    const error = new CliError.UserError({
      cause,
      userMessage: `Cannot read the version from package.json: ${cause.message}`,
    })
    error[Runtime.errorReported] = false
    const formatter = yield* CliOutput.Formatter
    yield* Console.error(formatter.formatError(error))
    return yield* error
  })
}

/**
 * Runs `wakusei` against an argument list.
 *
 * `entryUrl` is the `import.meta.url` of the executable; `--version` is read from the
 * `package.json` beside it. Only the entry can supply that: `src/index.ts` and the
 * `dist/index.js` it is packed into both sit one directory below the manifest.
 */
export function wakusei(argv: readonly string[], entryUrl: string) {
  return Effect.gen(function* () {
    const manifestPath = fileURLToPath(new URL('../package.json', entryUrl))
    const fs = yield* FileSystem.FileSystem
    const source = yield* fs.readFileString(manifestPath)
    const manifest = yield* Effect.try({
      try: (): unknown => JSON.parse(source),
      catch: (cause) => new Error(`${manifestPath} is not valid JSON`, { cause }),
    })
    const { version } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ version: Schema.String }),
    )(manifest)
    return yield* Command.runWith(cli, { version })(argv)
  }).pipe(Effect.catchIf((error) => !CliError.isCliError(error), reportBrokenInstall))
}
