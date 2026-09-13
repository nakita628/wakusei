import path from 'node:path'

import { Effect } from 'effect'
import type { OpenAPI } from 'oas-truth'
import { makeAdapter } from 'oas-truth'

import { emitFiles } from '../emit/index.js'
import type { ComponentKind } from '../generator/components.js'
import { makeComponentCode, makeComponentDeclarations } from '../generator/components.js'
import { makeSchemaDeclarations } from '../generator/schemas.js'
import type { ImportEntry } from '../helper/imports.js'
import { withImports } from '../helper/imports.js'
import { makeLibraryImports } from '../helper/library.js'
import type { Layout, WakuseiConfig } from './layout.js'
import { kindExportTypes, makeSchemasSpecifier, schemasExportTypes } from './layout.js'

type File = { readonly path: string; readonly code: string }

function makeBarrel(names: readonly string[]) {
  return names
    .toSorted()
    .map((name) => `export*from'./${name}'`)
    .join('\n')
}

function writeSplitFiles(
  directory: string,
  declarations: readonly { readonly fileName: string; readonly code: string }[],
  imports: readonly ImportEntry[],
): readonly File[] {
  if (declarations.length === 0) return []
  return [
    ...declarations.map((declaration) => ({
      path: path.join(directory, `${declaration.fileName}.ts`),
      code: withImports(declaration.code, imports),
    })),
    {
      path: path.join(directory, 'index.ts'),
      code: makeBarrel(declarations.map((declaration) => declaration.fileName)),
    },
  ]
}

/**
 * An `index.ts` re-exporting the component modules, when they are all `.ts` files in
 * one directory that does not already have an `index.ts` of its own. Split directories
 * keep their own barrel and are left out — otherwise `src/schemas` next to
 * `src/parameters.ts` would write `src/index.ts`.
 */
function makeComponentsBarrel(modules: readonly string[]): readonly File[] {
  const dir = modules[0] === undefined ? undefined : path.dirname(modules[0])
  if (dir === undefined || modules.length < 2) return []
  const index = path.join(dir, 'index.ts')
  if (
    modules.some(
      (module) => !module.endsWith('.ts') || path.dirname(module) !== dir || module === index,
    )
  ) {
    return []
  }
  return [{ path: index, code: makeBarrel(modules.map((module) => path.basename(module, '.ts'))) }]
}

/**
 * `components.schemas` and every other enabled kind through oas-truth's builders.
 * Aggregate: one module holds them all. Individual: the schemas
 * (one module, or one file per schema when split) and one file per kind — or one
 * file per entry when that kind's `split` is on — which import the schemas they
 * reference.
 */
export function writeComponents(openapi: OpenAPI, config: WakuseiConfig, layout: Layout) {
  const components = openapi.components ?? {}
  const adapter = makeAdapter(config.schema)
  const libraryImports = makeLibraryImports(config.schema)
  const declarations = makeSchemaDeclarations(components.schemas ?? {}, config.schema, {
    exportTypes: schemasExportTypes(config),
  })
  const kindOptions = (kind: ComponentKind) => ({
    readonly: config.readonly,
    exportTypes: kindExportTypes(kind, config),
  })

  if (layout.aggregate) {
    const parts = [
      ...declarations.map((d) => d.code),
      ...layout.components.map((target) =>
        makeComponentCode(target.kind, components, adapter, kindOptions(target.kind)),
      ),
    ].filter((part) => part !== '')
    if (parts.length === 0) return Effect.void
    return emitFiles([
      { path: layout.schemas.file, code: withImports(parts.join('\n\n'), libraryImports) },
    ])
  }

  const schemaFiles: readonly File[] = layout.schemas.split
    ? writeSplitFiles(layout.schemas.file, declarations, [
        ...libraryImports,
        ...declarations.map((peer) => ({ name: peer.varName, from: `./${peer.fileName}` })),
      ])
    : declarations.length === 0
      ? []
      : [
          {
            path: layout.schemas.file,
            code: withImports(declarations.map((d) => d.code).join('\n\n'), libraryImports),
          },
        ]
  const splitFiles = layout.components
    .filter((target) => target.split)
    .flatMap((target) => {
      const from = makeSchemasSpecifier(layout, target.file, target.import)
      const schemaImports = declarations.map((d) => ({ name: d.varName, from }))
      return writeSplitFiles(
        target.file,
        makeComponentDeclarations(target.kind, components, adapter, kindOptions(target.kind)),
        [...libraryImports, ...schemaImports],
      )
    })
  // Two kinds configured into one file share it.
  const componentFiles = [
    ...Map.groupBy(
      layout.components.filter((target) => !target.split),
      (target) => target.file,
    ),
  ].flatMap(([file, targets]) => {
    const code = targets
      .map((target) =>
        makeComponentCode(target.kind, components, adapter, kindOptions(target.kind)),
      )
      .filter((part) => part !== '')
      .join('\n\n')
    if (code === '') return []
    const from = makeSchemasSpecifier(layout, path.dirname(file), targets[0]?.import)
    const schemaImports = declarations.map((d) => ({ name: d.varName, from }))
    return [{ path: file, code: withImports(code, [...libraryImports, ...schemaImports]) }]
  })
  const schemasModule = schemaFiles.length > 0 && !layout.schemas.split ? [layout.schemas.file] : []
  return emitFiles([
    ...schemaFiles,
    ...splitFiles,
    ...componentFiles,
    ...makeComponentsBarrel([...schemasModule, ...componentFiles.map((file) => file.path)]),
  ])
}
