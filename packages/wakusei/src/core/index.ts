import path from 'node:path'

import { Effect } from 'effect'

import { FormatOptions } from '../format/index.js'
import { makeOperations } from '../helper/operations.js'
import { parseOpenAPI } from '../openapi/index.js'
import { writeClient } from './client.js'
import { writeComponents } from './components.js'
import type { WakuseiConfig } from './layout.js'
import { resolveLayout } from './layout.js'
import { resolvePackageRoots } from './packages.js'
import { writeContract, writeServer, writeSingleFile } from './procedures.js'

/**
 * Parses the spec and writes the oRPC code the config describes, formatting with its
 * `format` block: one module when `output` is a `.ts` file, otherwise the components
 * first, then the server handlers or the contract (whose modules import them). Which
 * package each output is in decides how those imports are written. With `client`, the
 * client of the contract comes last, when there is a contract (an operation) to call. The
 * `FileSystem` everything writes through comes from the caller's environment.
 */
export function orpc(config: WakuseiConfig) {
  return Effect.gen(function* () {
    const openapi = yield* parseOpenAPI(config.input)
    const hasOperations = makeOperations(openapi).length > 0
    if (config.output.endsWith('.ts')) {
      const file = path.resolve(process.cwd(), config.output)
      yield* writeSingleFile(openapi, config, file)
      if (config.client !== undefined && hasOperations) {
        yield* writeClient(config.client, file, process.cwd(), config.pathAlias)
      }
      return undefined
    }
    const layout = yield* resolvePackageRoots(resolveLayout(config))
    yield* writeComponents(openapi, config, layout)
    if (config.mode === 'server') return yield* writeServer(openapi, config, layout)
    yield* writeContract(openapi, config, layout)
    if (config.client !== undefined && layout.contract !== undefined && hasOperations) {
      return yield* writeClient(config.client, layout.contract, layout.base, layout.pathAlias)
    }
    return undefined
  }).pipe(Effect.provideService(FormatOptions, config.format ?? {}))
}
