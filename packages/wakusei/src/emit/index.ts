import { availableParallelism } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'

import { mkdir, writeFile } from '../file/index.js'
import { fmt } from '../format/index.js'

/**
 * How many files are formatted and written at once. oxfmt formats off the main thread, so
 * files overlap each other's formatting and I/O; the bound keeps a split layout with
 * thousands of files from opening them all at the same time.
 */
export const EMIT_CONCURRENCY = availableParallelism()

/** Formats generated source and writes it to `output`, creating `dir` on the way. */
export function emit(code: string, dir: string, output: string) {
  return Effect.gen(function* () {
    const [formatted] = yield* Effect.all([fmt(code), mkdir(dir)], { concurrency: 'unbounded' })
    yield* writeFile(output, formatted)
  })
}

/**
 * Emits every file, {@link EMIT_CONCURRENCY} at a time. Every file is formatted before any
 * is written, so a file oxfmt rejects fails the batch with nothing on disk.
 */
export function emitFiles(files: readonly { readonly path: string; readonly code: string }[]) {
  return Effect.gen(function* () {
    const formatted = yield* Effect.forEach(
      files,
      (file) => Effect.map(fmt(file.code), (code) => ({ path: file.path, code })),
      { concurrency: EMIT_CONCURRENCY },
    )
    const dirs = [...new Set(files.map((file) => path.dirname(file.path)))]
    yield* Effect.forEach(dirs, mkdir, { concurrency: EMIT_CONCURRENCY, discard: true })
    yield* Effect.forEach(formatted, (file) => writeFile(file.path, file.code), {
      concurrency: EMIT_CONCURRENCY,
      discard: true,
    })
  })
}
