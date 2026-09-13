import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { wakuseiVite } from './index.js'

// A generator that is slow the first time, recording whether two runs were ever in flight at
// once. The real generator is too fast to hold a run open while the next change arrives.
const runs = vi.hoisted(() => ({ started: 0, active: 0, overlapped: false }))

vi.mock('../core/index.js', async () => {
  const { Effect: E } = await import('effect')
  return {
    orpc: vi.fn<(config: unknown) => Effect.Effect<void>>(() =>
      E.gen(function* () {
        runs.started += 1
        if (runs.active > 0) runs.overlapped = true
        runs.active += 1
        yield* E.sleep(runs.started === 1 ? '600 millis' : '0 millis')
        runs.active -= 1
      }),
    ),
  }
})

const originalCwd = process.cwd()

/**
 * Waits for the plugin's background work. A real generation can take seconds when the suite
 * runs in parallel on a busy machine, and `vi.waitFor` gives up after one second by default.
 */
function eventually(assertion: () => void) {
  return vi.waitFor(assertion, { timeout: 20_000 })
}
const dirs: string[] = []

beforeEach(() => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-vite-serial-')))
  dirs.push(dir)
  process.chdir(dir)
  Object.assign(runs, { started: 0, active: 0, overlapped: false })
})

afterEach(() => {
  process.chdir(originalCwd)
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('wakuseiVite', () => {
  it('never runs two generations at once, so the merge never reads a half-written file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const sentMessages: unknown[] = []
    const watcherCallbacks: ((eventType: string, filePath: string) => void)[] = []
    const plugin = wakuseiVite()
    plugin.configureServer({
      watcher: {
        add: () => undefined,
        on: (_event: 'all', callback: (eventType: string, filePath: string) => void) => {
          watcherCallbacks.push(callback)
        },
      },
      ws: {
        send: (payload: unknown) => {
          sentMessages.push(payload)
        },
      },
      pluginContainer: { resolveId: () => Promise.resolve(null) },
      moduleGraph: {
        getModuleById: () => null,
        invalidateAll: () => undefined,
        invalidateModule: () => undefined,
      },
      ssrLoadModule: () =>
        Promise.resolve({ default: { input: 'openapi.yaml', mode: 'server', output: '.' } }),
    })
    // The startup run is in flight (and slow) when the spec changes.
    await eventually(() => {
      expect(runs.started).toBe(1)
    })
    for (const onChange of watcherCallbacks) onChange('change', path.resolve('openapi.yaml'))

    await eventually(() => {
      expect(sentMessages).toHaveLength(2)
    })
    expect(runs).toStrictEqual({ started: 2, active: 0, overlapped: false })
  })
})
