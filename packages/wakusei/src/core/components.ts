import path from 'node:path'

import { Effect } from 'effect'
import type { OpenAPI } from 'oas-truth'
import { makeAdapter } from 'oas-truth'

import { emitFiles } from '../emit/index.js'
import type { ComponentKind } from '../generator/components.js'
import { makeComponentCode } from '../generator/components.js'
import { makeSchemaDeclarations } from '../generator/schemas.js'
import { withImports } from '../helper/imports.js'
import { makeLibraryImports } from '../helper/library.js'
import type { Layout, WakuseiConfig } from './layout.js'
import { makeSchemasSpecifier } from './layout.js'

type File = { readonly path: string; readonly code: string }

function makeBarrel(names: readonly string[]) {
  return names
    .toSorted()
    .map((name) => `export*from'./${name}'`)
    .join('\n')
}

/**
 * An `index.ts` re-exporting the component modules, when they all sit in one directory
 * that does not already have an `index.ts` of its own. `modules` are files, or the
 * directory of split schemas.
 */
function makeComponentsBarrel(modules: readonly string[]): readonly File[] {
  const dir = modules[0] === undefined ? undefined : path.dirname(modules[0])
  if (dir === undefined || modules.length < 2) return []
  const index = path.join(dir, 'index.ts')
  if (modules.some((module) => path.dirname(module) !== dir || module === index)) return []
  return [{ path: index, code: makeBarrel(modules.map((module) => path.basename(module, '.ts'))) }]
}

/**
 * `components.schemas` and every other enabled kind through oas-truth's builders.
 * Aggregate: one module holds them all. Individual: the schemas
 * (one module, or one file per schema when split) and one file per kind, which imports
 * the schemas it references.
 */
export function writeComponents(openapi: OpenAPI, config: WakuseiConfig, layout: Layout) {
  const components = openapi.components ?? {}
  const adapter = makeAdapter(config.schema)
  const libraryImports = makeLibraryImports(config.schema)
  const declarations = makeSchemaDeclarations(components.schemas ?? {}, config.schema, {
    exportTypes: config.exportSchemasTypes,
  })
  const kindCode = (kind: ComponentKind) =>
    makeComponentCode(kind, components, adapter, {
      readonly: config.readonly,
      exportTypes:
        (kind === 'parameters' && config.exportParametersTypes) ||
        (kind === 'headers' && config.exportHeadersTypes) ||
        (kind === 'mediaTypes' && config.exportMediaTypesTypes),
    })

  if (layout.aggregate) {
    const parts = [
      ...declarations.map((d) => d.code),
      ...layout.components.map((target) => kindCode(target.kind)),
    ].filter((part) => part !== '')
    if (parts.length === 0) return Effect.void
    return emitFiles([
      { path: layout.schemas.file, code: withImports(parts.join('\n\n'), libraryImports) },
    ])
  }

  const schemaFiles: readonly File[] = layout.schemas.split
    ? declarations.length === 0
      ? []
      : [
          ...declarations.map((d) => ({
            path: path.join(layout.schemas.file, `${d.fileName}.ts`),
            // Split schema files import each other by file name.
            code: withImports(d.code, [
              ...libraryImports,
              ...declarations.map((peer) => ({ name: peer.varName, from: `./${peer.fileName}` })),
            ]),
          })),
          {
            path: path.join(layout.schemas.file, 'index.ts'),
            code: makeBarrel(declarations.map((d) => d.fileName)),
          },
        ]
    : declarations.length === 0
      ? []
      : [
          {
            path: layout.schemas.file,
            code: withImports(declarations.map((d) => d.code).join('\n\n'), libraryImports),
          },
        ]
  // Two kinds configured into one file share it.
  const componentFiles = [...Map.groupBy(layout.components, (target) => target.file)].flatMap(
    ([file, targets]) => {
      const code = targets
        .map((target) => kindCode(target.kind))
        .filter((part) => part !== '')
        .join('\n\n')
      if (code === '') return []
      const from = makeSchemasSpecifier(layout, path.dirname(file), targets[0]?.import)
      const schemaImports = declarations.map((d) => ({ name: d.varName, from }))
      return [{ path: file, code: withImports(code, [...libraryImports, ...schemaImports]) }]
    },
  )
  const schemasModule = schemaFiles.length > 0 ? [layout.schemas.file] : []
  return emitFiles([
    ...schemaFiles,
    ...componentFiles,
    ...makeComponentsBarrel([...schemasModule, ...componentFiles.map((file) => file.path)]),
  ])
}
