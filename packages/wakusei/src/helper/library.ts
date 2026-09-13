import { makeSafeKey } from 'oas-truth'

import type { ImportEntry } from './imports.js'

/** The validator libraries wakusei generates for; each one implements Standard Schema, which oRPC takes. */
export type SchemaLib = 'zod' | 'valibot' | 'arktype'

/**
 * What wakusei needs per validator library beyond oas-truth's adapter: the object a
 * procedure's combined input is built from, and the identifiers generated code may import.
 */
type Library = {
  /** An object schema over `key:value` fields. */
  readonly object: (fields: readonly string[]) => string
  /** One object field; an optional one may be absent from the input. */
  readonly field: (key: string, expr: string, required: boolean) => string
  readonly imports: readonly ImportEntry[]
}

const LIBRARIES: { readonly [K in SchemaLib]: Library } = {
  zod: {
    object: (fields) => `z.object({${fields.join(',')}})`,
    field: (key, expr, required) =>
      `${makeSafeKey(key)}:${required ? expr : `${expr}.exactOptional()`}`,
    imports: [{ name: 'z', from: 'zod', style: 'namespace' }],
  },
  valibot: {
    object: (fields) => `v.object({${fields.join(',')}})`,
    field: (key, expr, required) =>
      `${makeSafeKey(key)}:${required ? expr : `v.optional(${expr})`}`,
    imports: [{ name: 'v', from: 'valibot', style: 'namespace' }],
  },
  arktype: {
    object: (fields) => `type({${fields.join(',')}})`,
    // arktype marks an optional key in the key itself; the value stays the plain type.
    field: (key, expr, required) =>
      `${required ? makeSafeKey(key) : JSON.stringify(`${key}?`)}:${expr}`,
    // `scope` is what oas-truth builds an arktype `$ref` cycle with.
    imports: [
      { name: 'type', from: 'arktype' },
      { name: 'scope', from: 'arktype' },
    ],
  },
}

export function getLibrary(lib: SchemaLib) {
  return LIBRARIES[lib]
}

/** The oRPC entry points and the library namespace; `withImports` keeps only the referenced ones. */
export function makeLibraryImports(lib: SchemaLib): readonly ImportEntry[] {
  return [
    { name: 'os', from: '@orpc/server' },
    { name: 'implement', from: '@orpc/server' },
    { name: 'oc', from: '@orpc/contract' },
    ...LIBRARIES[lib].imports,
  ]
}
