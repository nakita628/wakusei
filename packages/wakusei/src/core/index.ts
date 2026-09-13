import path from 'node:path'

import { Effect } from 'effect'

import { FormatOptions } from '../format/index.js'
import { parseOpenAPI } from '../openapi/index.js'
import { writeComponents } from './components.js'
import type { WakuseiConfig } from './layout.js'
import { resolveLayout } from './layout.js'
import { writeContract, writeServer, writeSingleFile } from './procedures.js'

/**
 * Parses the spec and writes the oRPC code the config describes, formatting with its
 * `format` block: one module when `output` is a `.ts` file, otherwise the components
 * first, then the server handlers or the contract (whose modules import them). The
 * `FileSystem` everything writes through comes from the caller's environment.
 */
export function orpc(config: WakuseiConfig) {
  return Effect.gen(function* () {
    const openapi = yield* parseOpenAPI(config.input)
    if (config.output.endsWith('.ts')) {
      return yield* writeSingleFile(openapi, config, path.resolve(process.cwd(), config.output))
    }
    const layout = resolveLayout(config)
    yield* writeComponents(openapi, config, layout)
    return yield* config.mode === 'server'
      ? writeServer(openapi, config, layout)
      : writeContract(openapi, config, layout)
  }).pipe(Effect.provideService(FormatOptions, config.format ?? {}))
}
