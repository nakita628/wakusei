import type {
  ComponentAdapter,
  ComponentCodeOptions,
  ComponentDeclaration,
  Components,
} from 'oas-truth'
import {
  makeCallbacksDeclarations,
  makeExamplesDeclarations,
  makeHeadersDeclarations,
  makeLinksDeclarations,
  makeMediaTypesDeclarations,
  makeParametersDeclarations,
  makePathItemsDeclarations,
  makeRequestBodiesDeclarations,
  makeResponsesDeclarations,
  makeSchemaIdentifiers,
  makeSecuritySchemesDeclarations,
} from 'oas-truth'

/** The Components kinds besides `schemas`, in the order an aggregate module lists them. */
export const COMPONENT_KINDS = [
  'responses',
  'parameters',
  'headers',
  'examples',
  'requestBodies',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
  'mediaTypes',
] as const

export type ComponentKind = (typeof COMPONENT_KINDS)[number]

const BUILDERS: {
  readonly [K in ComponentKind]: (
    components: Components,
    adapter: ComponentAdapter,
    options: ComponentCodeOptions,
  ) => readonly ComponentDeclaration[]
} = {
  responses: (c, a, o) => makeResponsesDeclarations(c, a, o),
  parameters: (c, a, o) => makeParametersDeclarations(c, a, o),
  headers: (c, a, o) => makeHeadersDeclarations(c, a, o),
  examples: (c, _, o) => makeExamplesDeclarations(c, o),
  requestBodies: (c, a, o) => makeRequestBodiesDeclarations(c, a, o),
  securitySchemes: (c, _, o) => makeSecuritySchemesDeclarations(c, o),
  links: (c, _, o) => makeLinksDeclarations(c, o),
  callbacks: (c, a, o) => makeCallbacksDeclarations(c, a, o),
  pathItems: (c, a, o) => makePathItemsDeclarations(c, a, o),
  mediaTypes: (c, a, o) => makeMediaTypesDeclarations(c, a, o),
}

/**
 * The declarations of one Components kind through oas-truth's builders, without imports
 * (the caller derives them from what the code references). `$ref`s to a schema resolve
 * through the collision map, so they name the declared identifier. Empty when the document
 * declares none.
 */
export function makeComponentDeclarations(
  kind: ComponentKind,
  components: Components,
  adapter: ComponentAdapter,
  options: {
    /** `as const` on the generated objects. */
    readonly readonly: boolean
    /** `export type` next to each parameter / header / media type schema. */
    readonly exportTypes: boolean
  },
) {
  return BUILDERS[kind](components, adapter, {
    ...options,
    identifiers: makeSchemaIdentifiers(components.schemas ?? {}),
  })
}

/** The joined source of {@link makeComponentDeclarations}, empty when the document declares none. */
export function makeComponentCode(
  kind: ComponentKind,
  components: Components,
  adapter: ComponentAdapter,
  options: {
    /** `as const` on the generated objects. */
    readonly readonly: boolean
    /** `export type` next to each parameter / header / media type schema. */
    readonly exportTypes: boolean
  },
) {
  return makeComponentDeclarations(kind, components, adapter, options)
    .map((declaration) => declaration.code)
    .join('\n\n')
}
