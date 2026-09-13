// The Vite plugin in a real Vite dev server: it loads cases/vite-plugin/wakusei.config.ts and
// generates on startup. The plugin reads the config from the working directory, which is why
// the suite runs with pool 'forks'.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'
import { afterAll, describe, expect, it, vi } from 'vite-plus/test'
import { wakuseiVite } from 'wakusei/vite-plugin'

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const caseDir = path.join(testRoot, 'cases', 'vite-plugin')
const outDir = path.join(testRoot, '__generated__', 'vite-plugin')
const handlersIndex = path.join(outDir, 'src', 'handlers', 'index.ts')
const originalCwd = process.cwd()

afterAll(() => {
  process.chdir(originalCwd)
})

describe('wakuseiVite in a Vite dev server', () => {
  it('generates from the config when the dev server starts', async () => {
    process.chdir(caseDir)
    rmSync(outDir, { recursive: true, force: true })

    const server = await createServer({
      root: caseDir,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      plugins: [wakuseiVite()],
    })
    try {
      await vi.waitFor(
        () => {
          expect(existsSync(handlersIndex)).toBe(true)
        },
        { timeout: 60_000 },
      )
      expect(readFileSync(handlersIndex, 'utf8')).toBe(
        "export * from './postPublished'\nexport * from './posts'\nexport * from './tree'\nexport * from './users'\n",
      )
    } finally {
      await server.close()
    }
  })
})
