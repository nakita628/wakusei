import { describe, expect, it } from 'vite-plus/test'

import { makeOperations } from '../helper/operations.js'
import { makeContract, makeContractImplementations, makeServerProcedures } from './procedures.js'

const schemas = {
  Tag: { type: 'string' },
  Pet: { type: 'object', properties: { name: { type: 'string' } } },
}

const openapi = {
  openapi: '3.1.0',
  info: { title: 't', version: '1' },
  paths: {
    '/': { get: { responses: { '200': { description: 'It\'s "ok"\nreally' } } } },
    '/users/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      patch: {
        tags: ['users'],
        summary: 'Patch',
        deprecated: true,
        parameters: [
          { name: 'dry-run', in: 'query', required: true, schema: { type: 'boolean' } },
          { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
          {
            name: 'filter',
            in: 'query',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { q: { type: 'string' } } },
              },
            },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string' }, name: { $ref: '#/components/schemas/Tag' } },
              },
            },
          },
        },
        responses: { '202': { $ref: '#/components/responses/Accepted' } },
      },
    },
    '/items': { $ref: '#/components/pathItems/Items' },
  },
  webhooks: {
    newPet: {
      post: {
        requestBody: { $ref: '#/components/requestBodies/PetBody' },
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas,
    parameters: { Id: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } } },
    responses: {
      Accepted: {
        description: 'Accepted for processing',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
      },
    },
    requestBodies: {
      PetBody: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
      },
    },
    pathItems: { Items: { post: { responses: {} }, delete: { responses: {} } } },
  },
}

const operations = makeOperations(openapi as never)
const context = {
  lib: 'zod',
  schemas: schemas as never,
  identifiers: new Map([
    ['Tag', 'Tag'],
    ['Pet', 'Pet'],
  ]),
  prefix: undefined,
} as const

describe('makeOperations', () => {
  it('resolves references, picks the success response and serves webhooks as /<name>', () => {
    expect(
      operations.map((op) => [
        op.name,
        op.path,
        op.successStatus,
        op.successDescription,
        op.output,
        op.parameters.map((p) => `${p.in}:${p.name}`),
      ]),
    ).toStrictEqual([
      ['get', '/', 200, 'It\'s "ok"\nreally', undefined, []],
      [
        'patchUsersId',
        '/users/{id}',
        202,
        'Accepted for processing',
        { $ref: '#/components/schemas/Pet' },
        ['path:id', 'query:dry-run', 'header:X-Trace', 'query:filter'],
      ],
      ['postItems', '/items', 201, undefined, undefined, []],
      ['deleteItems', '/items', 204, undefined, undefined, []],
      ['postNewPet', '/newPet', 200, undefined, undefined, []],
    ])
  })
})

describe('makeServerProcedures', () => {
  it('chains route, input, output and a stub handler per operation', () => {
    expect(makeServerProcedures(operations, context).split('\n\n')).toStrictEqual([
      'export const get=os.route({method:"GET",path:"/",successDescription:"It\'s \\"ok\\"\\nreally"}).handler(async({input})=>{})',
      'export const patchUsersId=os.route({method:"PATCH",path:"/users/{id}",tags:["users"],summary:"Patch",deprecated:true,successStatus:202,successDescription:"Accepted for processing"}).input(z.object({id:z.coerce.number().int(),"dry-run":z.stringbool(),filter:z.object({q:z.string().exactOptional()}).exactOptional(),name:TagSchema.exactOptional()})).output(PetSchema).handler(async({input})=>{})',
      'export const postItems=os.route({method:"POST",path:"/items",successStatus:201}).handler(async({input})=>{})',
      'export const deleteItems=os.route({method:"DELETE",path:"/items",successStatus:204}).handler(async({input})=>{})',
      'export const postNewPet=os.route({method:"POST",path:"/newPet"}).input(PetSchema).handler(async({input})=>{})',
    ])
  })

  it("splits a parameter's text by its style, explode and allowEmptyValue", () => {
    const styled = makeOperations({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/items': {
          get: {
            parameters: [
              {
                name: 'ids',
                in: 'query',
                style: 'form',
                explode: false,
                schema: { type: 'array', items: { type: 'integer' } },
              },
              { name: 'q', in: 'query', allowEmptyValue: true, schema: { type: 'string' } },
              { name: 'tag', in: 'query', style: 'unknown', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as never)
    expect(makeServerProcedures(styled, context)).toBe(
      'export const getItems=os.route({method:"GET",path:"/items"}).input(z.object({ids:z.preprocess((val)=>{if(typeof val!==\'string\')return val;const text=val;return (text===\'\'?[]:text.split(","))},z.preprocess((val)=>(val===undefined||Array.isArray(val)?val:[val]),z.array(z.coerce.number().int()))).exactOptional(),q:z.preprocess((val)=>(val===\'\'?undefined:val),z.string()).exactOptional(),tag:z.string().exactOptional()})).handler(async({input})=>{})',
    )
  })
})

describe('makeContract', () => {
  it('builds one router, prefixing every path', () => {
    expect(
      makeContract(operations.slice(1, 2), { ...context, lib: 'valibot', prefix: '/v1' }),
    ).toBe(
      'export const contract={patchUsersId:oc.route({method:"PATCH",path:"/v1/users/{id}",tags:["users"],summary:"Patch",deprecated:true,successStatus:202,successDescription:"Accepted for processing"}).input(v.object({id:v.pipe(v.string(),v.transform(Number),v.number(),v.safeInteger()),"dry-run":v.pipe(v.string(),v.regex(/^(?:true|1|yes|on|y|enabled|false|0|no|off|n|disabled)$/i),v.transform((input)=>/^(?:true|1|yes|on|y|enabled)$/i.test(input))),filter:v.optional(v.partial(v.object({q:v.string()}))),name:v.optional(TagSchema)})).output(PetSchema)}',
    )
  })

  it('marks optional fields in the key for arktype', () => {
    expect(makeContract(operations.slice(1, 2), { ...context, lib: 'arktype' })).toBe(
      'export const contract={patchUsersId:oc.route({method:"PATCH",path:"/users/{id}",tags:["users"],summary:"Patch",deprecated:true,successStatus:202,successDescription:"Accepted for processing"}).input(type({id:type("string").pipe((data, ctx) => { const value = Number(data); return Number.isSafeInteger(value) ? value : ctx.error("an integer") }),"dry-run":type(/^(?:true|1|yes|on|y|enabled|false|0|no|off|n|disabled)$/i).pipe((data) => /^(?:true|1|yes|on|y|enabled)$/i.test(data)),"filter?":type({"q?":"string"}),"name?":TagSchema})).output(PetSchema)}',
    )
  })

  it('is empty without operations', () => {
    expect(makeContract([], context)).toBe('')
  })
})

describe('makeContractImplementations', () => {
  it('implements the contract with one stub per procedure', () => {
    expect(makeContractImplementations(operations.slice(0, 2))).toBe(
      'const os=implement(contract)\n\nexport const get=os.get.handler(async({input})=>{})\nexport const patchUsersId=os.patchUsersId.handler(async({input})=>{})',
    )
  })
})
