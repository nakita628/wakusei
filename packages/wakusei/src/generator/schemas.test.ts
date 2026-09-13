import { describe, expect, it } from 'vite-plus/test'

import { makeSchemaDeclarations } from './schemas.js'

const schemas = {
  Tag: { type: 'string' },
  Pet: {
    type: 'object',
    required: ['name'],
    properties: { name: { type: 'string' }, tag: { $ref: '#/components/schemas/Tag' } },
  },
  Node: {
    type: 'object',
    properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
  },
  A: { type: 'object', properties: { b: { $ref: '#/components/schemas/B' } } },
  B: { type: 'object', properties: { a: { $ref: '#/components/schemas/A' } } },
} as const

function codes(lib: 'zod' | 'valibot' | 'arktype') {
  return makeSchemaDeclarations(schemas as never, lib).map((d) => d.code)
}

describe('makeSchemaDeclarations', () => {
  it('zod: declares dependencies first and makes only cycle references lazy', () => {
    expect(codes('zod')).toStrictEqual([
      'export const TagSchema=z.string()\n\nexport type TagSchema=z.infer<typeof TagSchema>',
      'export const PetSchema=z.object({name:z.string(),tag:TagSchema.exactOptional()})\n\nexport type PetSchema=z.infer<typeof PetSchema>',
      'type NodeType={"children"?:(NodeType)[]}\n\nexport const NodeSchema:z.ZodType<NodeType>=z.object({children:z.array(z.lazy(() => NodeSchema)).exactOptional()})\n\nexport type NodeSchema=z.infer<typeof NodeSchema>',
      'type AType={"b"?:z.infer<typeof BSchema>}\n\nexport const ASchema:z.ZodType<AType>=z.object({b:z.lazy(() => BSchema).exactOptional()})\n\nexport type ASchema=z.infer<typeof ASchema>',
      'type BType={"a"?:z.infer<typeof ASchema>}\n\nexport const BSchema:z.ZodType<BType>=z.object({a:z.lazy(() => ASchema).exactOptional()})\n\nexport type BSchema=z.infer<typeof BSchema>',
    ])
  })

  it('valibot: annotates recursive declarations with GenericSchema over a | undefined helper', () => {
    expect(codes('valibot')).toStrictEqual([
      'export const TagSchema=v.string()\n\nexport type TagSchema=v.InferOutput<typeof TagSchema>',
      'export const PetSchema=v.object({name:v.string(),tag:v.optional(TagSchema)})\n\nexport type PetSchema=v.InferOutput<typeof PetSchema>',
      'type NodeType={"children"?:(NodeType)[]|undefined}\n\nexport const NodeSchema:v.GenericSchema<NodeType>=v.partial(v.object({children:v.array(v.lazy(() => NodeSchema))}))\n\nexport type NodeSchema=v.InferOutput<typeof NodeSchema>',
      'type AType={"b"?:v.InferOutput<typeof BSchema>|undefined}\n\nexport const ASchema:v.GenericSchema<AType>=v.partial(v.object({b:v.lazy(() => BSchema)}))\n\nexport type ASchema=v.InferOutput<typeof ASchema>',
      'type BType={"a"?:v.InferOutput<typeof ASchema>|undefined}\n\nexport const BSchema:v.GenericSchema<BType>=v.partial(v.object({a:v.lazy(() => ASchema)}))\n\nexport type BSchema=v.InferOutput<typeof BSchema>',
    ])
  })

  it('arktype: gives each cycle one scope container', () => {
    expect(codes('arktype')).toStrictEqual([
      'export const TagSchema=type("string")\n\nexport type TagSchema=typeof TagSchema.infer',
      'export const PetSchema=type({name:"string","tag?":TagSchema})\n\nexport type PetSchema=typeof PetSchema.infer',
      'export const NodeSchema=scope({NodeSchema:{"children?":"NodeSchema[]"}}).export().NodeSchema\n\nexport type NodeSchema=typeof NodeSchema.infer',
      'export const ASchema=scope({BSchema:{"a?":"ASchema"},ASchema:{"b?":"BSchema"}}).export().ASchema\n\nexport type ASchema=typeof ASchema.infer',
      'export const BSchema=scope({BSchema:{"a?":"ASchema"},ASchema:{"b?":"BSchema"}}).export().BSchema\n\nexport type BSchema=typeof BSchema.infer',
    ])
  })

  it('aliases a reference leaving an arktype cycle to the declared schema', () => {
    const tagged = {
      Tag: { type: 'string' },
      Node: {
        type: 'object',
        properties: {
          tag: { $ref: '#/components/schemas/Tag' },
          next: { $ref: '#/components/schemas/Node' },
        },
      },
    }
    expect(makeSchemaDeclarations(tagged as never, 'arktype').map((d) => d.code)).toStrictEqual([
      'export const TagSchema=type("string")\n\nexport type TagSchema=typeof TagSchema.infer',
      'export const NodeSchema=scope({TagSchema:TagSchema,NodeSchema:{"tag?":"TagSchema","next?":"NodeSchema"}}).export().NodeSchema\n\nexport type NodeSchema=typeof NodeSchema.infer',
    ])
  })

  it('names split files after the identifier', () => {
    expect(
      makeSchemaDeclarations(schemas as never, 'zod').map((d) => [d.name, d.varName, d.fileName]),
    ).toStrictEqual([
      ['Tag', 'TagSchema', 'tag'],
      ['Pet', 'PetSchema', 'pet'],
      ['Node', 'NodeSchema', 'node'],
      ['A', 'ASchema', 'a'],
      ['B', 'BSchema', 'b'],
    ])
  })
})
