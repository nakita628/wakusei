import type { Schema } from 'oas-truth'
import { makeAdapter, makeSchemaDeclarations as declareSchemas } from 'oas-truth'

import type { SchemaLib } from '../helper/library.js'

/**
 * One `export const <X>Schema=...` declaration per `components.schemas` entry, through
 * oas-truth: dependency-first order, `$ref` cycles and colliding names are its job. The
 * host choice is that the exported type is named after the constant
 * (`export type PostSchema = z.infer<typeof PostSchema>`) when `exportTypes` is on.
 */
export function makeSchemaDeclarations(
  schemas: { readonly [k: string]: Schema },
  lib: SchemaLib,
  options?: { readonly exportTypes?: boolean },
) {
  return declareSchemas(schemas, makeAdapter(lib), {
    exportTypes: options?.exportTypes ?? true,
    typeAlias: 'const',
  })
}
