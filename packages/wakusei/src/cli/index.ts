import { Console, Effect, Option, Schema } from 'effect'
import { Argument, CliError, Command, Flag } from 'effect/cli'

import manifest from '../../package.json' with { type: 'json' }
import { DEFAULT_CONFIG_FILE, parseConfig } from '../config/index.js'
import { makeReport, reportConfigPass, runConfigPass, watchConfig } from './watch.js'

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
  input: Argument.File('input', { mustExist: true }).pipe(
    Argument.withSchema(DocumentPathSchema),
    Argument.withDescription('OpenAPI (.yaml, .json) or TypeSpec (.tsp) document to generate from'),
    Argument.withMetavar('input.{yaml,json,tsp}'),
    Argument.optional,
  ),
  // `Flag.String`, not `Flag.File`: the file primitive rewrites its value to an absolute
  // path, and `--output` is echoed back in the report, which should read as typed.
  output: Flag.String('output').pipe(
    Flag.withAlias('o'),
    Flag.withDescription(
      'Contract mode: a .ts file for a single module, or a directory (without -o: server mode into .)',
    ),
    Flag.withMetavar('output'),
    Flag.optional,
  ),
  schema: Flag.Literals('schema', ['zod', 'valibot', 'arktype']).pipe(
    Flag.withDescription('Validation library for <input> (default: zod)'),
    Flag.withMetavar('lib'),
    Flag.optional,
  ),
  config: Flag.File('config', { mustExist: true }).pipe(
    Flag.withAlias('c'),
    Flag.withDescription(`Config file to run (default: ./${DEFAULT_CONFIG_FILE})`),
    Flag.withMetavar('file'),
    Flag.optional,
  ),
  // `Flag.Boolean` is still a required flag until it is given a default — without this,
  // every invocation is rejected for not passing `--watch`.
  watch: Flag.Boolean('watch').pipe(
    Flag.withAlias('w'),
    Flag.withDescription('Rerun the config on every change to its input documents or itself'),
    Flag.withDefault(false),
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
 * everything else (`template`, `components`, `pathAlias`, `format`, ...) — once, or on
 * every change with `--watch`.
 *
 * The generator pipeline pulls in the OpenAPI parser, the TypeSpec compiler and oxc-parser.
 * `--help`, `--version`, `--completions` and every rejected command line must not pay for
 * that, so it is loaded lazily rather than at module scope.
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
    // One-shot writes from one document and is done; there is no second pass for a change
    // to trigger.
    if (args.watch && input !== undefined) {
      return yield* showHelp(
        '--watch runs a config file, so it cannot be combined with <input>, --output or --schema.',
      )
    }
    if (input === undefined && (output ?? schema) !== undefined) {
      return yield* showHelp('--output and --schema need an <input> document.')
    }

    if (input !== undefined) {
      const config = yield* parseConfig({
        input,
        output: output ?? '.',
        mode: output === undefined ? 'server' : 'contract',
        schema: schema ?? 'zod',
      })
      const { orpc } = yield* Effect.promise(() => import('../core/index.js'))
      yield* orpc(config)
      return yield* Console.log(makeReport(config))
    }

    const resolvedConfig = configPath ?? DEFAULT_CONFIG_FILE
    // Under `--watch` the first pass is a pass like any other: the caller asked for a
    // command that stays up and reacts to edits, and a config that does not validate yet is
    // the first edit to react to. Without it, one typo ends the session.
    if (args.watch) {
      return yield* watchConfig(resolvedConfig, yield* reportConfigPass(resolvedConfig, false))
    }
    const pass = yield* runConfigPass(resolvedConfig, false).pipe(
      // A config that is absent and was never asked for is the "ran `wakusei` with nothing"
      // case, the one place where the usage block is the answer. A config that is present
      // and wrong already names the field.
      Effect.mapError((error) =>
        configPath === undefined && error._tag === 'ConfigError' && error.notFound === true
          ? new CliError.ShowHelp({
              commandPath: [COMMAND_NAME],
              errors: [new CliError.UserError({ cause: error, userMessage: error.message })],
            })
          : error,
      ),
    )
    return yield* Console.log(pass.report)
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
 * are owned by `effect/cli`, {@link generate} is the rest.
 */
const cli = Command.make(COMMAND_NAME, commandLine, generate).pipe(
  Command.withDescription(manifest.description),
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
    {
      command: `${COMMAND_NAME} --watch`,
      description: 'Rerun on every change to the input documents or the config',
    },
  ]),
)

/**
 * Runs `wakusei` against the arguments the `Stdio` service supplies — the process's own on
 * Node, a fixed list under `Stdio.layerTest`. `--version` is the manifest's, bundled in at
 * build time.
 */
export function wakusei() {
  return Command.run(cli, { version: manifest.version })
}
