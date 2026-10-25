import path from 'node:path'

import type { FormatConfig } from 'oxfmt'

import type { ComponentKind } from '../generator/components.js'
import { COMPONENT_KINDS } from '../generator/components.js'
import type { SchemaLib } from '../helper/library.js'

type ExportFlag =
  | 'exportSchemas'
  | 'exportSchemasTypes'
  | 'exportResponses'
  | 'exportParameters'
  | 'exportParametersTypes'
  | 'exportHeaders'
  | 'exportHeadersTypes'
  | 'exportExamples'
  | 'exportRequestBodies'
  | 'exportSecuritySchemes'
  | 'exportLinks'
  | 'exportCallbacks'
  | 'exportPathItems'
  | 'exportMediaTypes'
  | 'exportMediaTypesTypes'

/** The config `orpc()` runs from (the shape `parseConfig` returns). */
export type WakuseiConfig = {
  readonly input: string
  readonly mode: 'server' | 'contract'
  readonly output: string
  readonly schema: SchemaLib
  readonly readonly: boolean
  readonly format?: FormatConfig | undefined
  readonly pathAlias?: string | undefined
  readonly prefix?: string | undefined
  readonly template?: { readonly output?: string | undefined } | undefined
  readonly client?: ClientConfig | undefined
  readonly components?:
    | ({
        readonly output?: string | undefined
        readonly package?: string | undefined
        readonly schemas?: ComponentTarget | undefined
      } & {
        readonly [K in ComponentKind]?: ComponentTarget | undefined
      })
    | undefined
} & { readonly [K in ExportFlag]: boolean }

/** Where the client reads its base URL from: the origin of the page, or the environment. */
export type BaseUrl =
  | string
  | { readonly env: string; readonly source: 'import.meta.env' | 'process.env' }
  | { readonly env: string; readonly import: string; readonly name: string }

/** `client`, contract mode alone. */
export type ClientConfig = {
  readonly output?: string | undefined
  readonly baseUrl: BaseUrl
  readonly credentials?: 'include' | 'same-origin' | 'omit' | undefined
  readonly import?: string | undefined
}

/** One per-type `components.*` target after the config is written. */
export type ComponentTarget = {
  readonly output: string
  readonly split?: boolean | undefined
  readonly exportTypes?: boolean | undefined
  /** `components.schemas` alone: the package it is written into. */
  readonly package?: string | undefined
}

export type Layout = {
  /** The absolute base directory every relative output resolves against. */
  readonly base: string
  readonly pathAlias: string | undefined
  /**
   * The module holding every component schema; a directory with `index.ts` when split.
   * `package` is the name the generated files of other packages import it by.
   */
  readonly schemas: {
    readonly file: string
    readonly split: boolean
    readonly package: string | undefined
  }
  /** Whether the kinds below live in the schemas module itself. */
  readonly aggregate: boolean
  /** The Components kinds the config turns on, each with its file or split directory. */
  readonly components: readonly {
    readonly kind: ComponentKind
    readonly split: boolean
    readonly file: string
  }[]
  /** `@orpc/server` procedures (server) or `implement(contract)` stubs (contract + template). */
  readonly handlersDir: string | undefined
  /** The `@orpc/contract` router (contract mode). */
  readonly contract: string | undefined
  /**
   * The package each directory generated files are written into belongs to: the directory
   * of the nearest `package.json` above it. Empty until `resolvePackageRoots` fills it, and
   * a directory it does not list is in the package of the schemas.
   */
  readonly packageRoots: ReadonlyMap<string, string | undefined>
}

const EXPORT_FLAGS: { readonly [K in ComponentKind]: ExportFlag } = {
  responses: 'exportResponses',
  parameters: 'exportParameters',
  headers: 'exportHeaders',
  examples: 'exportExamples',
  requestBodies: 'exportRequestBodies',
  securitySchemes: 'exportSecuritySchemes',
  links: 'exportLinks',
  callbacks: 'exportCallbacks',
  pathItems: 'exportPathItems',
  mediaTypes: 'exportMediaTypes',
}

const DEFAULT_FILES: { readonly [K in ComponentKind]: string } = {
  responses: 'src/components/responses.ts',
  parameters: 'src/components/parameters.ts',
  headers: 'src/components/headers.ts',
  examples: 'src/components/examples.ts',
  requestBodies: 'src/components/request-bodies.ts',
  securitySchemes: 'src/components/security-schemes.ts',
  links: 'src/components/links.ts',
  callbacks: 'src/components/callbacks.ts',
  pathItems: 'src/components/path-items.ts',
  mediaTypes: 'src/components/media-types.ts',
}

function toFile(output: string) {
  return output.endsWith('.ts') ? output : path.join(output, 'index.ts')
}

/**
 * Two component layouts. Aggregate: without per-kind config, flags or a kind's
 * `split`, the schemas and every flagged kind share one module — `components.output`,
 * `components.schemas.output`, or `src/components/index.ts`. Individual: otherwise the
 * schemas get their own module (default `src/components/schemas.ts`) and each kind
 * that is flagged or configured gets its file (default `src/components/<kind>.ts`) —
 * or a directory, when that kind's `split` is on.
 */
export function resolveLayout(config: WakuseiConfig): Layout {
  const base = path.resolve(process.cwd(), config.output)
  const components = config.components
  const enabled = COMPONENT_KINDS.filter(
    (kind) => config[EXPORT_FLAGS[kind]] || components?.[kind] !== undefined,
  )
  const split = components?.schemas?.split === true
  const aggregate = components?.output !== undefined || (!split && enabled.length === 0)
  const schemasOutput = components?.output ?? components?.schemas?.output
  const schemas = path.resolve(
    base,
    aggregate
      ? toFile(schemasOutput ?? 'src/components/index.ts')
      : split
        ? (schemasOutput ?? 'src/components/schemas')
        : toFile(schemasOutput ?? 'src/components/schemas.ts'),
  )
  const handlersDir =
    config.mode === 'server'
      ? 'src/handlers'
      : config.template === undefined
        ? undefined
        : (config.template.output ?? 'src/handlers')
  return {
    base,
    pathAlias: config.pathAlias,
    schemas: {
      file: schemas,
      split,
      package: aggregate ? components?.package : components?.schemas?.package,
    },
    aggregate,
    components: enabled.map((kind) => {
      const target = components?.[kind]
      const splitKind = target?.split === true
      return {
        kind,
        split: splitKind,
        file: aggregate
          ? schemas
          : path.resolve(
              base,
              splitKind
                ? (target?.output ?? DEFAULT_FILES[kind].replace(/\.ts$/u, ''))
                : toFile(target?.output ?? DEFAULT_FILES[kind]),
            ),
      }
    }),
    handlersDir: handlersDir === undefined ? undefined : path.resolve(base, handlersDir),
    contract: config.mode === 'contract' ? path.resolve(base, 'src/contract.ts') : undefined,
    packageRoots: new Map(),
  }
}

/** The directory a schemas import is written from, for a component target. */
export function componentDirectory(target: { readonly file: string; readonly split: boolean }) {
  return target.split ? target.file : path.dirname(target.file)
}

/**
 * Every directory a generated file that imports the schemas is written into: each
 * component kind beside them, the handlers and the contract.
 */
export function schemasImporters(layout: Layout) {
  return [
    ...(layout.aggregate ? [] : layout.components.map(componentDirectory)),
    ...(layout.handlersDir === undefined ? [] : [layout.handlersDir]),
    ...(layout.contract === undefined ? [] : [path.dirname(layout.contract)]),
  ]
}

/** The directory the schemas are written into. */
export function schemasDirectory(layout: Layout) {
  return componentDirectory(layout.schemas)
}

/** Whether a directory is the package of the schemas, as far as `packageRoots` knows. */
function isSchemasPackage(layout: Layout, fromDir: string) {
  const roots = layout.packageRoots
  const own = roots.get(schemasDirectory(layout))
  return !roots.has(fromDir) || roots.get(fromDir) === own
}

/** `export type` for a kind: the top-level `export*Types` flag or `components.<kind>.exportTypes`. */
export function kindExportTypes(kind: ComponentKind, config: WakuseiConfig) {
  const perKind = config.components?.[kind]?.exportTypes === true
  if (kind === 'parameters') return perKind || config.exportParametersTypes
  if (kind === 'headers') return perKind || config.exportHeadersTypes
  if (kind === 'mediaTypes') return perKind || config.exportMediaTypesTypes
  return perKind
}

/** `export type` next to each `components.schemas` declaration. */
export function schemasExportTypes(config: WakuseiConfig) {
  return config.exportSchemasTypes || config.components?.schemas?.exportTypes === true
}

/** A path as a module specifier: POSIX separators, no `.ts`, no trailing `index`. */
function toSpecifier(file: string) {
  return file
    .replaceAll('\\', '/')
    .replace(/\.ts$/u, '')
    .replace(/(?:^|\/)index$/u, '')
}

/** A relative specifier from `fromDir` to `file`. */
export function makeRelativeSpecifier(fromDir: string, file: string) {
  const rel = toSpecifier(path.relative(fromDir, file))
  if (rel === '') return '.'
  return rel.startsWith('.') ? rel : `./${rel}`
}

/** Whether `file` sits under `dir`. */
function isInside(dir: string, file: string) {
  const rel = path.relative(dir, file)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * The specifier a module in `fromDir` imports the schemas with: by `package` from another
 * package, under the path alias (which stands for `<output>/src`) when the schemas are in
 * there, and relatively otherwise. `resolvePackageRoots` has seen to it that another
 * package names its `package`.
 */
export function makeSchemasSpecifier(layout: Layout, fromDir: string) {
  if (!isSchemasPackage(layout, fromDir) && layout.schemas.package !== undefined) {
    return layout.schemas.package
  }
  const file = layout.schemas.split
    ? path.join(layout.schemas.file, 'index.ts')
    : layout.schemas.file
  return makeLocalSpecifier(layout.base, layout.pathAlias, fromDir, file)
}

/**
 * The specifier a module in `fromDir` imports `file` of the same package with: under the
 * path alias (which stands for `<base>/src`) when `file` is in there, relatively otherwise.
 */
export function makeLocalSpecifier(
  base: string,
  pathAlias: string | undefined,
  fromDir: string,
  file: string,
) {
  const src = path.join(base, 'src')
  if (pathAlias !== undefined && isInside(src, file)) {
    const alias = pathAlias.replace(/\/$/u, '')
    const rel = toSpecifier(path.relative(src, file))
    return rel === '' ? alias : `${alias}/${rel}`
  }
  return makeRelativeSpecifier(fromDir, file)
}
