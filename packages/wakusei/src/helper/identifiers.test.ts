import { describe, expect, it } from 'vite-plus/test'

import { collectFreeIdentifiers } from './identifiers.js'

describe('collectFreeIdentifiers', () => {
  it('excludes top-level declarations', () => {
    expect([
      ...collectFreeIdentifiers(
        'export const ASchema=z.object({b:BSchema})\n\nexport type A=z.infer<typeof ASchema>',
      ),
    ]).toStrictEqual(['z', 'BSchema'])
  })

  it('reads references, not names inside strings, regex literals, keys or members', () => {
    expect([
      ...collectFreeIdentifiers(
        "export const ASchema=type({'BSchema?':'string',c:CSchema,d}).pipe((data)=>/^ZSchema$/u.test(data)?v.string():'z')",
      ),
    ]).toStrictEqual(['type', 'CSchema', 'd', 'data', 'v'])
  })

  it('reads the left side of a qualified type name', () => {
    expect([
      ...collectFreeIdentifiers('export type A=z.infer<typeof ASchema>&Schema.Schema.Type<B>'),
    ]).toStrictEqual(['z', 'ASchema', 'Schema', 'B'])
  })
})
