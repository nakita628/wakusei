import path from 'node:path'

import { Effect } from 'effect'
import type { OpenAPI } from 'oas-truth'
import { makeSchemaIdentifiers } from 'oas-truth'

import { emit } from '../emit/index.js'
import { readdir, readFile, unlink } from '../file/index.js'
import {
  makeContract,
  makeContractImplementations,
  makeServerProcedures,
} from '../generator/procedures.js'
import { makeSchemaDeclarations } from '../generator/schemas.js'
import type { ImportEntry } from '../helper/imports.js'
import { withImports } from '../helper/imports.js'
import { makeLibraryImports } from '../helper/library.js'
import type { OperationInfo } from '../helper/operations.js'
import { makeOperationGroups, makeOperations } from '../helper/operations.js'
import { mergeProcedureFile } from '../merge/index.js'
import type { Layout, WakuseiConfig } from './layout.js'
import { makeRelativeSpecifier, makeSchemasSpecifier } from './layout.js'

function makeContext(openapi: OpenAPI, config: WakuseiConfig) {
  const schemas = openapi.components?.schemas
  return {
    lib: config.schema,
    schemas,
    identifiers: makeSchemaIdentifiers(schemas ?? {}),
    prefix: config.prefix,
  }
}

/** The schema identifiers a module may reference, all imported from `from`. */
function makeSchemaImports(
  identifiers: ReadonlyMap<string, string>,
  from: string,
): readonly ImportEntry[] {
  return [...identifiers.values()]
    .map((identifier) => `${identifier}Schema`)
    .toSorted()
    .map((name) => ({ name, from }))
}

/**
 * One merged file per resource group and an `index.ts` barrel. Existing handler bodies
 * survive through `mergeProcedureFile`; `.ts` files no group maps to any more are deleted.
 */
function writeHandlerFiles(
  dir: string,
  groups: ReadonlyMap<string, readonly OperationInfo[]>,
  makeCode: (operations: readonly OperationInfo[]) => string,
  managed: ReadonlySet<string>,
) {
  return Effect.gen(function* () {
    const names = [...groups.keys()]
    yield* Effect.forEach(
      groups,
      ([name, operations]) =>
        Effect.gen(function* () {
          const file = path.join(dir, `${name}.ts`)
          const code = makeCode(operations)
          const existing = yield* readFile(file)
          const merged = existing === null ? code : mergeProcedureFile(existing, code, managed)
          yield* emit(merged, dir, file)
        }),
      { discard: true },
    )
    if (names.length > 0) {
      const barrel = names
        .toSorted()
        .map((name) => `export*from'./${name}'`)
        .join('\n')
      yield* emit(barrel, dir, path.join(dir, 'index.ts'))
    }
    const expected = new Set([...names.map((name) => `${name}.ts`), 'index.ts'])
    const entries = yield* readdir(dir)
    yield* Effect.forEach(
      entries.filter((entry) => entry.endsWith('.ts') && !expected.has(entry)),
      (entry) => unlink(path.join(dir, entry)),
      { discard: true },
    )
  })
}

/** Server mode: `@orpc/server` procedures, one handler file per resource. */
export function writeServer(openapi: OpenAPI, config: WakuseiConfig, layout: Layout) {
  const dir = layout.handlersDir
  if (dir === undefined) return Effect.void
  const context = makeContext(openapi, config)
  const from = makeSchemasSpecifier(layout, dir)
  const imports = [
    ...makeLibraryImports(config.schema),
    ...makeSchemaImports(context.identifiers, from),
  ]
  return writeHandlerFiles(
    dir,
    makeOperationGroups(makeOperations(openapi)),
    (operations) => withImports(makeServerProcedures(operations, context), imports),
    new Set([from]),
  )
}

/** Contract mode: the `@orpc/contract` router, and (with `template`) handler stubs implementing it. */
export function writeContract(openapi: OpenAPI, config: WakuseiConfig, layout: Layout) {
  return Effect.gen(function* () {
    const file = layout.contract
    if (file === undefined) return
    const context = makeContext(openapi, config)
    const operations = makeOperations(openapi)
    const libraryImports = makeLibraryImports(config.schema)
    const contract = makeContract(operations, context)
    if (contract !== '') {
      const from = makeSchemasSpecifier(layout, path.dirname(file))
      const code = withImports(contract, [
        ...libraryImports,
        ...makeSchemaImports(context.identifiers, from),
      ])
      yield* emit(code, path.dirname(file), file)
    }
    const dir = layout.handlersDir
    if (dir === undefined) return
    const contractImport = makeRelativeSpecifier(dir, file)
    const imports = [...libraryImports, { name: 'contract', from: contractImport }]
    yield* writeHandlerFiles(
      dir,
      makeOperationGroups(operations),
      (group) => withImports(makeContractImplementations(group), imports),
      new Set([contractImport]),
    )
  })
}

/**
 * Single-file mode (`output` is a `.ts` file): the schemas and the router (contract) or
 * the procedures (server) in one module, rewritten on every run.
 */
export function writeSingleFile(openapi: OpenAPI, config: WakuseiConfig, file: string) {
  const context = makeContext(openapi, config)
  const operations = makeOperations(openapi)
  const parts = [
    ...makeSchemaDeclarations(openapi.components?.schemas ?? {}, config.schema).map((d) => d.code),
    config.mode === 'server'
      ? makeServerProcedures(operations, context)
      : makeContract(operations, context),
  ].filter((part) => part !== '')
  if (parts.length === 0) return Effect.void
  const code = withImports(parts.join('\n\n'), makeLibraryImports(config.schema))
  return emit(code, path.dirname(file), file)
}
