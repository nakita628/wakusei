import path from 'node:path'

import { Effect } from 'effect'
import type { OpenAPI } from 'oas-truth'
import { makeSchemaIdentifiers } from 'oas-truth'

import { EMIT_CONCURRENCY, emit } from '../emit/index.js'
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
import { makeOperationGroups, makeOperations, makeResourceName } from '../helper/operations.js'
import { mergeProcedureFile } from '../merge/index.js'
import type { Layout, WakuseiConfig } from './layout.js'
import { makeRelativeSpecifier, makeSchemasSpecifier, schemasExportTypes } from './layout.js'

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

/** A handler file name (as NFC) with case and every character that is no letter, mark or digit ignored. */
function makeFileKey(file: string) {
  return path
    .basename(file, '.ts')
    .normalize('NFC')
    .replaceAll(/[^\p{L}\p{M}\p{N}]/gu, '')
    .toLowerCase()
}

/** A file name as a case-insensitive filesystem compares it. */
function fold(file: string) {
  return file.normalize('NFC').toLowerCase()
}

/** The resource an existing handler file was written for, read from its base name. */
function makeFileResource(file: string) {
  return makeResourceName(`/${path.basename(file, '.ts')}`)
}

/**
 * Each group paired with its file, no existing file (compared without case, as on a
 * case-insensitive filesystem) handed to two groups. Every group first takes a file named
 * `<name>.ts` in any case, then a file whose base name reads as the same resource
 * (`realTimeEvents.ts` or `real_time_events.ts` for `real-time-events`, `Index.ts` for
 * `index-resource`), then a file that differs only in case and separators; otherwise the
 * expected `<name>.ts` is written. A project whose files were written under another name keeps
 * them; nothing is renamed.
 */
function resolveHandlerFiles(
  groups: ReadonlyMap<string, readonly OperationInfo[]>,
  existing: readonly string[],
) {
  const names = [...groups.keys()]
  const taken = new Set(names.map((name) => fold(`${name}.ts`)))
  const resolved = new Map<string, string>()
  const passes: readonly ((name: string, file: string) => boolean)[] = [
    (name, file) => fold(file) === fold(`${name}.ts`),
    (name, file) => makeFileResource(file) === name,
    (name, file) => makeFileKey(file) === makeFileKey(name),
  ]
  for (const [index, matches] of passes.entries()) {
    for (const name of names) {
      if (resolved.has(name)) continue
      const file = existing.find(
        (entry) => (index === 0 || !taken.has(fold(entry))) && matches(name, entry),
      )
      if (file === undefined) continue
      resolved.set(name, file)
      taken.add(fold(file))
    }
  }
  return [...groups].map(
    ([name, operations]) => [resolved.get(name) ?? `${name}.ts`, operations] as const,
  )
}

/**
 * One merged file per resource group and an `index.ts` barrel. Existing handler bodies
 * survive through `mergeProcedureFile`; `.ts` files no group's name matches any more are deleted.
 */
function writeHandlerFile(
  dir: string,
  file: string,
  operations: readonly OperationInfo[],
  makeCode: (operations: readonly OperationInfo[]) => string,
  managed: ReadonlySet<string>,
) {
  return Effect.gen(function* () {
    const filePath = path.join(dir, file)
    const code = makeCode(operations)
    const existing = yield* readFile(filePath)
    const merged = existing === null ? code : mergeProcedureFile(existing, code, managed)
    yield* emit(merged, dir, filePath)
  })
}

function writeHandlerFiles(
  dir: string,
  groups: ReadonlyMap<string, readonly OperationInfo[]>,
  makeCode: (operations: readonly OperationInfo[]) => string,
  managed: ReadonlySet<string>,
) {
  return Effect.gen(function* () {
    const existing = (yield* readdir(dir))
      .filter((entry) => entry.endsWith('.ts') && entry !== 'index.ts')
      .toSorted()
    const files = resolveHandlerFiles(groups, existing)
    yield* Effect.forEach(
      files,
      ([file, operations]) => writeHandlerFile(dir, file, operations, makeCode, managed),
      { concurrency: EMIT_CONCURRENCY, discard: true },
    )
    if (files.length > 0) {
      const barrel = files
        .map(([file]) => path.basename(file, '.ts'))
        .toSorted()
        .map((name) => `export*from'./${name}'`)
        .join('\n')
      yield* emit(barrel, dir, path.join(dir, 'index.ts'))
    }
    // A second file of a group (`userProfiles.ts` beside `user_profiles.ts`) may still hold
    // hand-written code, so only a file no group's name matches is deleted.
    const names = new Set(groups.keys())
    const keys = new Set([...names].map(makeFileKey))
    const written = new Set(files.map(([file]) => file))
    yield* Effect.forEach(
      existing.filter(
        (entry) =>
          !written.has(entry) &&
          !names.has(makeFileResource(entry)) &&
          !keys.has(makeFileKey(entry)),
      ),
      (entry) => unlink(path.join(dir, entry)),
      { concurrency: EMIT_CONCURRENCY, discard: true },
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
    ...makeSchemaDeclarations(openapi.components?.schemas ?? {}, config.schema, {
      exportTypes: schemasExportTypes(config),
    }).map((d) => d.code),
    config.mode === 'server'
      ? makeServerProcedures(operations, context)
      : makeContract(operations, context),
  ].filter((part) => part !== '')
  if (parts.length === 0) return Effect.void
  const code = withImports(parts.join('\n\n'), makeLibraryImports(config.schema))
  return emit(code, path.dirname(file), file)
}
