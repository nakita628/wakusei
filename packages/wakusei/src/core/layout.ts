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
  readonly components?:
    | ({
        readonly output?: string | undefined
        readonly schemas?: ComponentTarget | undefined
      } & {
        readonly [K in ComponentKind]?: ComponentTarget | undefined
      })
    | undefined
} & { readonly [K in ExportFlag]: boolean }

/** One per-type `components.*` target after the config is written. */
export type ComponentTarget = {
  readonly output: string
  readonly split?: boolean | undefined
  readonly import?: string | undefined
  readonly exportTypes?: boolean | undefined
}

/** A module the generator writes, and the specifier others must use for it when overridden. */
export type Target = { readonly file: string; readonly import: string | undefined }

export type Layout = {
  /** The absolute base directory every relative output resolves against. */
  readonly base: string
  readonly pathAlias: string | undefined
  /** The module holding every component schema; a directory with `index.ts` when split. */
  readonly schemas: Target & { readonly split: boolean }
  /** Whether the kinds below live in the schemas module itself. */
  readonly aggregate: boolean
  /** The Components kinds the config turns on, each with its file or split directory. */
  readonly components: readonly (Target & {
    readonly kind: ComponentKind
    readonly split: boolean
  })[]
  /** `@orpc/server` procedures (server) or `implement(contract)` stubs (contract + template). */
  readonly handlersDir: string | undefined
  /** The `@orpc/contract` router (contract mode). */
  readonly contract: string | undefined
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
    schemas: { file: schemas, split, import: components?.schemas?.import },
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
        import: target?.import,
      }
    }),
    handlersDir: handlersDir === undefined ? undefined : path.resolve(base, handlersDir),
    contract: config.mode === 'contract' ? path.resolve(base, 'src/contract.ts') : undefined,
  }
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

/**
 * The specifier a module in `fromDir` imports the schemas with: the `import` override,
 * the path alias (which stands for `<output>/src`), or a relative path.
 */
export function makeSchemasSpecifier(layout: Layout, fromDir: string, override?: string) {
  const explicit = override ?? layout.schemas.import
  if (explicit) return explicit
  const file = layout.schemas.split
    ? path.join(layout.schemas.file, 'index.ts')
    : layout.schemas.file
  if (layout.pathAlias) {
    const alias = layout.pathAlias.replace(/\/$/u, '')
    const rel = toSpecifier(path.relative(path.join(layout.base, 'src'), file))
    return rel === '' ? alias : `${alias}/${rel}`
  }
  return makeRelativeSpecifier(fromDir, file)
}
