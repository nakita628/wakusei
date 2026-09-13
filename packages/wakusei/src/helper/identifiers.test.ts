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
})
