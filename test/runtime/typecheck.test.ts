// Every case's generated code — merged handler bodies included — type-checks against the
// libraries it imports, under strict, exactOptionalPropertyTypes and noUncheckedIndexedAccess.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vite-plus/test'

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('generated code', () => {
  it('type-checks against @orpc/*, zod, valibot and arktype (tsc per case)', () => {
    const result = spawnSync(process.execPath, [path.join(testRoot, 'scripts', 'typecheck.mjs')], {
      stdio: 'inherit',
    })
    expect(result.status).toBe(0)
  }, 600_000)
})
