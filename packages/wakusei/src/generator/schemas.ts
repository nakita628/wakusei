import type { Schema } from 'oas-truth'
import { makeAdapter, makeSchemaDeclarations as declareSchemas } from 'oas-truth'

import type { SchemaLib } from '../helper/library.js'

/**
 * One `export const <X>Schema=...` declaration per `components.schemas` entry, through
 * oas-truth: dependency-first order, `$ref` cycles and colliding names are its job. The
 * host choice is that every schema exports its type under the constant's name
 * (`export type PostSchema = z.infer<typeof PostSchema>`).
 */
export function makeSchemaDeclarations(schemas: { readonly [k: string]: Schema }, lib: SchemaLib) {
  return declareSchemas(schemas, makeAdapter(lib), { exportTypes: true, typeAlias: 'const' })
}
