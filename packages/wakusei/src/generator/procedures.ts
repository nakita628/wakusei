import type { Parameter, Schema } from 'oas-truth'
import { makeAdapter, makeSchemaVarName, schemaRefToName } from 'oas-truth'

import type { SchemaLib } from '../helper/library.js'
import { getLibrary } from '../helper/library.js'
import type { OperationInfo } from '../helper/operations.js'
import { getJsonSchema } from '../helper/operations.js'

type ProcedureContext = {
  readonly lib: SchemaLib
  /** `components.schemas`, for the properties of a `$ref` body merged into the input. */
  readonly schemas: { readonly [k: string]: Schema } | undefined
  /** `components.schemas` key → declared identifier (`makeSchemaIdentifiers`). */
  readonly identifiers: ReadonlyMap<string, string>
  /** Prepended to every route path (`/api/v1`). */
  readonly prefix: string | undefined
}

const STUB_HANDLER = '.handler(async({input})=>{})'

/** The declared schema a `$ref` points at, or the inline schema as an expression. */
function makeSchemaExpression(schema: Schema, context: ProcedureContext) {
  const declared =
    schema.$ref === undefined ? undefined : makeSchemaVarName(schema.$ref, context.identifiers)
  return declared ?? makeAdapter(context.lib).toExpression(schema)
}

function makeRoute(operation: OperationInfo, prefix: string | undefined) {
  const parts = [
    `method:${JSON.stringify(operation.method.toUpperCase())}`,
    `path:${JSON.stringify(`${prefix ?? ''}${operation.path}`)}`,
    ...(operation.tags && operation.tags.length > 0
      ? [`tags:${JSON.stringify(operation.tags)}`]
      : []),
    ...(operation.summary ? [`summary:${JSON.stringify(operation.summary)}`] : []),
    ...(operation.description ? [`description:${JSON.stringify(operation.description)}`] : []),
    ...(operation.deprecated === true ? ['deprecated:true'] : []),
    ...(operation.successStatus === 200 ? [] : [`successStatus:${operation.successStatus}`]),
    ...(operation.successDescription
      ? [`successDescription:${JSON.stringify(operation.successDescription)}`]
      : []),
  ]
  return `.route({${parts.join(',')}})`
}

/**
 * A parameter carries either `schema` or a `content` map; without either it accepts
 * anything rather than leaving the generator a hole.
 */
function makeParameterSchema(parameter: Parameter): Schema {
  return parameter.schema ?? getJsonSchema(parameter.content) ?? {}
}

/** Later fields whose key already appeared are dropped: a parameter wins over a body property. */
function dedupeFields(fields: readonly { readonly key: string; readonly code: string }[]) {
  return fields
    .filter((field, index) => fields.findIndex((f) => f.key === field.key) === index)
    .map((field) => field.code)
}

/**
 * The procedure's input: path and query parameters (coerced from the wire by
 * schema-to-library) and the JSON body. A body alone is the input as it is; next to
 * parameters, its properties join theirs in one object.
 */
function makeInput(operation: OperationInfo, context: ProcedureContext) {
  const adapter = makeAdapter(context.lib)
  const library = getLibrary(context.lib)
  // Path parameters come first, as the path reads; a path parameter is always required.
  const parameterFields = (['path', 'query'] as const).flatMap((location) =>
    operation.parameters
      .filter((parameter) => parameter.in === location)
      .map((parameter) => ({
        key: parameter.name,
        code: library.field(
          parameter.name,
          adapter.toExpression(makeParameterSchema(parameter), location),
          location === 'path' || parameter.required === true,
        ),
      })),
  )
  const body = getJsonSchema(operation.requestBody?.content)
  if (body && parameterFields.length === 0) {
    return `.input(${makeSchemaExpression(body, context)})`
  }
  const resolved = body?.$ref ? context.schemas?.[schemaRefToName(body.$ref)] : body
  const bodyFields = Object.entries(resolved?.properties ?? {}).map(([key, property]) => ({
    key,
    code: library.field(
      key,
      makeSchemaExpression(property, context),
      resolved?.required?.includes(key) === true,
    ),
  }))
  const fields = dedupeFields([...parameterFields, ...bodyFields])
  return fields.length > 0 ? `.input(${library.object(fields)})` : ''
}

function makeOutput(operation: OperationInfo, context: ProcedureContext) {
  return operation.output ? `.output(${makeSchemaExpression(operation.output, context)})` : ''
}

function makeChain(operation: OperationInfo, context: ProcedureContext) {
  return `${makeRoute(operation, context.prefix)}${makeInput(operation, context)}${makeOutput(operation, context)}`
}

/** `@orpc/server` procedures, each with a stub handler for the merge to fill. */
export function makeServerProcedures(
  operations: readonly OperationInfo[],
  context: ProcedureContext,
) {
  return operations
    .map(
      (operation) =>
        `export const ${operation.name}=os${makeChain(operation, context)}${STUB_HANDLER}`,
    )
    .join('\n\n')
}

/** One `@orpc/contract` router over every operation. */
export function makeContract(operations: readonly OperationInfo[], context: ProcedureContext) {
  if (operations.length === 0) return ''
  const entries = operations.map(
    (operation) => `${operation.name}:oc${makeChain(operation, context)}`,
  )
  return `export const contract={${entries.join(',')}}`
}

/** Handler stubs implementing the contract's procedures. */
export function makeContractImplementations(operations: readonly OperationInfo[]) {
  const handlers = operations.map(
    (operation) => `export const ${operation.name}=os.${operation.name}${STUB_HANDLER}`,
  )
  return `const os=implement(contract)\n\n${handlers.join('\n')}`
}
