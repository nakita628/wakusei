import { describe, expect, it } from 'vite-plus/test'

import { makeImports, withImports } from './imports.js'

const candidates = [
  { name: 'Type', from: 'typebox' },
  { name: 'Static', from: 'typebox', style: 'type' },
  { name: 'z', from: 'zod', style: 'namespace' },
  { name: 'UserSchema', from: '../components' },
  { name: 'PostSchema', from: '../components' },
  { name: 'UserSchema', from: '../elsewhere' },
] as const

describe('makeImports', () => {
  it('imports only referenced candidates, grouped per module', () => {
    expect(
      makeImports(
        'export const A=Type.Object({u:UserSchema})\n\nexport type A=Static<typeof A>',
        candidates,
      ),
    ).toStrictEqual([
      "import{Type,type Static}from'typebox'",
      "import{UserSchema}from'../components'",
    ])
  })

  it('ignores declarations, object keys, member names and strings', () => {
    expect(
      makeImports(
        'export const PostSchema=z.object({UserSchema:z.string().describe("UserSchema"),a:x.UserSchema})',
        candidates,
      ),
    ).toStrictEqual(["import*as z from'zod'"])
  })

  it('renders a type-only import', () => {
    expect(makeImports('export type A=Static<typeof B>', candidates)).toStrictEqual([
      "import type{Static}from'typebox'",
    ])
  })
})

describe('withImports', () => {
  it.each([
    ['const a=UserSchema', "import{UserSchema}from'../components'\n\nconst a=UserSchema"],
    ['const a=1', 'const a=1'],
  ])('%s', (body, expected) => {
    expect(withImports(body, candidates)).toBe(expected)
  })
})
