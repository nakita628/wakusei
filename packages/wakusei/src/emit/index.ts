import path from 'node:path'

import { Effect } from 'effect'

import { mkdir, writeFile } from '../file/index.js'
import { fmt } from '../format/index.js'

/** Formats generated source and writes it to `output`, creating `dir` on the way. */
export function emit(code: string, dir: string, output: string) {
  return Effect.gen(function* () {
    const [formatted] = yield* Effect.all([fmt(code), mkdir(dir)], { concurrency: 'unbounded' })
    yield* writeFile(output, formatted)
  })
}

/** Emits every file, one at a time, stopping at the first failure. */
export function emitFiles(files: readonly { readonly path: string; readonly code: string }[]) {
  return Effect.forEach(files, (file) => emit(file.code, path.dirname(file.path), file.path), {
    discard: true,
  })
}
