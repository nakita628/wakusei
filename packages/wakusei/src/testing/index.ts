import type { FileSystem } from 'effect'
import { Effect } from 'effect'

import { fileSystemLayer } from '../file/index.js'

/**
 * Runs a generator against the real filesystem, the way the CLI does, and answers with
 * what it produced. A failure rejects, carrying the generator's own error.
 *
 * Test-only — nothing in `dist` imports it.
 */
export function runGenerator<A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) {
  return Effect.runPromise(effect.pipe(Effect.provide(fileSystemLayer)))
}

/** The same, for a generator that is expected to fail: answers with the error it failed with. */
export function runGeneratorError<A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) {
  return Effect.runPromise(Effect.flip(effect.pipe(Effect.provide(fileSystemLayer))))
}
