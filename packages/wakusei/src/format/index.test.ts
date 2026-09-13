import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { fmt, FormatError, FormatOptions } from './index.js'

describe('fmt', () => {
  it('formats with the defaults (printWidth 100, single quotes, no semicolons)', async () => {
    expect(await Effect.runPromise(fmt('const x = "hello";'))).toBe("const x = 'hello'\n")
  })

  it('formats with the options in scope', async () => {
    const result = await Effect.runPromise(
      fmt('const x = "hello"').pipe(Effect.provideService(FormatOptions, { semi: true })),
    )
    expect(result).toBe("const x = 'hello';\n")
  })

  it('fails with FormatError on source oxfmt cannot parse', async () => {
    expect(await Effect.runPromise(Effect.flip(fmt('const = ;')))).toStrictEqual(
      new FormatError({ message: 'Unexpected token' }),
    )
  })
})
