import type {
  OpenAPI,
  Operation,
  Parameter,
  PathItem,
  Reference,
  RequestBody,
  Responses,
  Schema,
} from 'oas-truth'
import { schemaRefToName } from 'oas-truth'

/** The methods an oRPC route can declare. */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

/** One procedure: an operation with its references resolved and its success response chosen. */
export type OperationInfo = {
  readonly method: HttpMethod
  /** OpenAPI path (`/posts/{postId}`), which is also oRPC's path syntax. */
  readonly path: string
  /** `getPostsPostId`: the procedure's export name, derived from method and path. */
  readonly name: string
  readonly tags: readonly string[] | undefined
  readonly summary: string | undefined
  readonly description: string | undefined
  readonly deprecated: boolean | undefined
  readonly parameters: readonly Parameter[]
  readonly requestBody: RequestBody | undefined
  readonly successStatus: number
  readonly successDescription: string | undefined
  /** The success response's `application/json` schema. */
  readonly output: Schema | undefined
}

function isInline<T extends object>(value: T | Reference): value is T {
  return !('$ref' in value && typeof value.$ref === 'string')
}

/** Follows a local `$ref` into its Components map (`undefined` when it does not resolve). */
function resolveRef<T extends object>(
  value: T | Reference | undefined,
  map: { readonly [k: string]: T } | undefined,
): T | undefined {
  if (value === undefined) return undefined
  if (isInline(value)) return value
  return map?.[schemaRefToName(value.$ref ?? '')]
}

/** `get` + `/posts/{postId}` → `getPostsPostId`. */
function makeName(method: HttpMethod, path: string) {
  const segments = path
    .replaceAll(/[^a-zA-Z0-9]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
  return `${method}${segments.join('')}`
}

/** The first 2xx response the operation declares, else the method's conventional one. */
function makeSuccessStatus(method: HttpMethod, responses: Operation['responses']) {
  const declared = Object.keys(responses)
    .map(Number)
    .find((status) => status >= 200 && status < 300)
  if (declared !== undefined) return declared
  if (method === 'post') return 201
  if (method === 'delete') return 204
  return 200
}

/** oRPC's own defaults already say `OK` / `Created` / `No Content`. */
function makeSuccessDescription(response: Responses | undefined) {
  const description = response?.description
  if (!description || ['OK', 'Created', 'No Content'].includes(description)) return undefined
  return description
}

/** `application/json`'s schema, for a request body or a response. */
export function getJsonSchema(content: { readonly [k: string]: unknown } | undefined) {
  const media = content?.['application/json']
  if (typeof media !== 'object' || media === null || !('schema' in media)) return undefined
  const schema: Schema | undefined = media.schema ?? undefined
  return schema
}

function makeOperationInfos(
  path: string,
  rawPathItem: PathItem,
  openapi: OpenAPI,
): readonly OperationInfo[] {
  const components = openapi.components
  const pathItem = resolveRef(rawPathItem, components?.pathItems)
  if (!pathItem) return []
  return HTTP_METHODS.flatMap((method) => {
    const operation = pathItem[method]
    if (!operation) return []
    const resolve = (raw: readonly (Parameter | Reference)[] | undefined) =>
      (raw ?? []).flatMap((p) => {
        const parameter = resolveRef(p, components?.parameters)
        return parameter ? [parameter] : []
      })
    // An operation-level parameter overrides the Path Item's one with the same name and location.
    const parameters = [
      ...new Map(
        [...resolve(pathItem.parameters), ...resolve(operation.parameters)].map(
          (p) => [`${p.in}:${p.name}`, p] as const,
        ),
      ).values(),
    ]
    const successStatus = makeSuccessStatus(method, operation.responses)
    const success = resolveRef(operation.responses[String(successStatus)], components?.responses)
    return [
      {
        method,
        path,
        name: makeName(method, path),
        tags: operation.tags,
        summary: operation.summary,
        description: operation.description,
        deprecated: operation.deprecated,
        parameters,
        requestBody: resolveRef(operation.requestBody, components?.requestBodies),
        successStatus,
        successDescription: makeSuccessDescription(success),
        output: getJsonSchema(success?.content),
      },
    ]
  })
}

/** Every path operation, then every OAS 3.1 webhook served as `/<name>`. */
export function makeOperations(openapi: OpenAPI) {
  const paths: { readonly [path: string]: PathItem } = openapi.paths
  return [
    ...Object.entries(paths).flatMap(([path, pathItem]) =>
      makeOperationInfos(path, pathItem, openapi),
    ),
    ...Object.entries(openapi.webhooks ?? {}).flatMap(([name, pathItem]) =>
      makeOperationInfos(`/${name}`, pathItem, openapi),
    ),
  ]
}

/** `/posts/{postId}` → `posts`; a path that starts with a parameter (or `/`) → `root`. */
function makeResourceName(path: string) {
  const first = path.split('/').find(Boolean)
  return !first || first.startsWith('{') ? 'root' : first
}

/** Operations grouped by resource: one handler file per group. */
export function makeOperationGroups(operations: readonly OperationInfo[]) {
  return Map.groupBy(operations, (operation) => makeResourceName(operation.path))
}
