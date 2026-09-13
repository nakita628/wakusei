import path from 'node:path'

import type { PlatformError } from 'effect'
import { Console, Effect, FileSystem, Ref, Result, Stream } from 'effect'

import type { Config } from '../config/index.js'
import { readConfig } from '../config/index.js'

/** Extensions a change has to carry to be worth regenerating for. */
const INPUT_EXTENSIONS = ['.yaml', '.json', '.tsp'] as const

/** The line a finished run reports, in one-shot and config mode alike. */
export function makeReport(config: Config) {
  return `🪐 wakusei: ${config.input} → ${config.output} (${config.mode}, ${config.schema}) ✅`
}

/**
 * One pass over a config file: read it, generate what it describes, and answer with the
 * config and the line to report. `reload` is for the passes after the first, where the
 * config file may have been edited since it was imported.
 *
 * The generator pipeline pulls in the OpenAPI parser, the TypeSpec compiler and ts-morph,
 * so it is loaded here rather than at module scope; after the first pass the loader
 * answers from cache, so a watch tick pays nothing.
 */
export function runConfigPass(configPath: string, reload: boolean) {
  return Effect.gen(function* () {
    const config = yield* readConfig(configPath, reload)
    const { orpc } = yield* Effect.promise(() => import('../core/index.js'))
    yield* orpc(config)
    return { config, report: makeReport(config) }
  })
}

/**
 * A pass whose failure is printed rather than raised, so the watch loop survives it, and
 * which answers with the directory of the input document the config now names.
 *
 * `undefined` means the pass did not get far enough to say — the config is missing, will
 * not import, or does not validate. The loop keeps watching the config either way.
 */
export function reportConfigPass(configPath: string, reload: boolean) {
  return Effect.gen(function* () {
    const result = yield* Effect.result(runConfigPass(configPath, reload))
    if (Result.isFailure(result)) {
      yield* Console.error(`❌ ${result.failure.message}`)
      return undefined
    }
    yield* Console.log(result.success.report)
    return path.dirname(path.resolve(process.cwd(), result.success.config.input))
  })
}

/**
 * Watches the config, and the input documents when a pass has said where they are, until
 * the answer changes — then hands the new directory back so {@link watchConfig} restarts.
 *
 * `runForEachWhile` is what ends the round: a pass that reports a different directory
 * returns `false`, and the directory it reported is in the `Ref` for the caller. It also
 * runs one pass at a time, so a change that arrives mid-pass waits for it: two passes would
 * read, merge and rewrite the same handler files.
 */
function watchRound(configPath: string, inputDirectory: string | undefined) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const configFile = path.basename(configPath)
    const nextDirectory = yield* Ref.make<string | undefined>(inputDirectory)
    const configEvents = fs
      .watch(path.dirname(path.resolve(configPath)))
      .pipe(Stream.filter((event) => event.path === configFile))
    const events =
      inputDirectory === undefined
        ? configEvents
        : Stream.merge(
            fs
              .watch(inputDirectory, { recursive: true })
              .pipe(
                Stream.filter((event) =>
                  INPUT_EXTENSIONS.some((extension) => event.path.endsWith(extension)),
                ),
              ),
            configEvents,
          )
    yield* events.pipe(
      // An editor reports a save as several events; one pass answers them all.
      Stream.debounce('200 millis'),
      // A pass that failed says nothing about where the documents are, so the round carries
      // on watching what it was watching. Only a pass that succeeded and named a different
      // directory ends the round.
      Stream.runForEachWhile(() =>
        reportConfigPass(configPath, true).pipe(
          Effect.tap((directory) => Ref.set(nextDirectory, directory ?? inputDirectory)),
          Effect.map((directory) => directory === undefined || directory === inputDirectory),
        ),
      ),
    )
    return yield* Ref.get(nextDirectory)
  })
}

/**
 * Regenerates on every change to the input documents or the config, until interrupted.
 *
 * The input document's directory is watched recursively — a TypeSpec entry imports its
 * siblings and a `$ref` can point at one, so the file named by `input` is rarely the only
 * one that matters. The config file is watched through its directory rather than directly,
 * so an editor that saves by renaming does not take the watcher down with it. Generated
 * files are `.ts`, so a pass cannot trigger the next one.
 *
 * `inputDirectory` is `undefined` until a pass has read a config far enough to name one;
 * only the config is watched until then, which is what keeps a config that does not
 * validate at startup from ending the command the caller asked to keep running.
 */
export function watchConfig(
  configPath: string,
  inputDirectory: string | undefined,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    yield* Console.log(
      inputDirectory === undefined
        ? `\n👀 Watching ${configPath} — Ctrl-C to stop`
        : `\n👀 Watching ${inputDirectory} and ${configPath} — Ctrl-C to stop`,
    )
    return yield* watchConfig(configPath, yield* watchRound(configPath, inputDirectory))
  })
}
