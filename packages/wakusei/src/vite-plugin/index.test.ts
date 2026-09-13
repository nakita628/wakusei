import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { wakuseiVite } from './index.js'

type MockServer = {
  watcher: {
    add: (paths: string | readonly string[]) => void
    on: (event: 'all', callback: (eventType: string, filePath: string) => void) => void
  }
  ws: { send: (payload: { type: string }) => void }
  pluginContainer: { resolveId: (moduleId: string) => Promise<{ id: string } | null> }
  moduleGraph: {
    invalidateModule: (module: { id?: string } | null) => void
    invalidateAll: () => void
    getModuleById: (moduleId: string) => { id?: string } | null
  }
  ssrLoadModule: (moduleId: string) => Promise<{ [k: string]: unknown }>
}

const SPEC = `openapi: 3.1.0
info: { title: Posts, version: 1.0.0 }
paths:
  /posts:
    get:
      responses:
        '200': { description: OK }
components:
  schemas:
    Post: { type: object, properties: { id: { type: integer } } }
    Draft: { type: object, properties: { title: { type: string } } }
`

function createMockServer(config: unknown) {
  const addedPaths: string[] = []
  const sentMessages: unknown[] = []
  const watcherCallbacks: ((eventType: string, filePath: string) => void)[] = []
  const state = { config }
  const server: MockServer = {
    watcher: {
      add: (paths) => {
        addedPaths.push(...[paths].flat())
      },
      on: (_event, callback) => {
        watcherCallbacks.push(callback)
      },
    },
    ws: {
      send: (payload) => {
        sentMessages.push(payload)
      },
    },
    pluginContainer: {
      resolveId: vi.fn<(moduleId: string) => Promise<{ id: string } | null>>(() =>
        Promise.resolve(null),
      ),
    },
    moduleGraph: {
      getModuleById: vi.fn<(moduleId: string) => { id?: string } | null>(() => null),
      invalidateAll: vi.fn<() => void>(),
      invalidateModule: vi.fn<(module: { id?: string } | null) => void>(),
    },
    ssrLoadModule: vi.fn<(moduleId: string) => Promise<{ [k: string]: unknown }>>(() =>
      Promise.resolve({ default: state.config }),
    ),
  }
  return { server, addedPaths, sentMessages, watcherCallbacks, state }
}

const base = { input: 'openapi.yaml', mode: 'server', output: '.' }
const originalCwd = process.cwd()
const dirs: string[] = []

beforeEach(() => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-vite-')))
  dirs.push(dir)
  process.chdir(dir)
  fs.writeFileSync('openapi.yaml', SPEC)
})

afterEach(() => {
  process.chdir(originalCwd)
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('wakuseiVite', { timeout: 30_000 }, () => {
  it('is a dev-only plugin whose buildStart does nothing', async () => {
    const plugin = wakuseiVite()
    expect(plugin.name).toBe('wakusei-vite')
    await expect(plugin.buildStart()).resolves.toBe(undefined)
  })

  it('keeps the config file out of HMR, and nothing else', () => {
    const plugin = wakuseiVite()
    const { server } = createMockServer(base)
    expect(plugin.handleHotUpdate({ file: path.join(process.cwd(), 'src/app.ts'), server })).toBe(
      undefined,
    )
    expect(
      plugin.handleHotUpdate({ file: path.join(process.cwd(), 'wakusei.config.ts'), server }),
    ).toStrictEqual([])
  })

  it('reloads and regenerates once for one config save, however many events Vite sends', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server, sentMessages, watcherCallbacks } = createMockServer(base)
    plugin.configureServer(server)
    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(1)
    })

    // One save as Vite reports it: an editor that writes twice, then the HMR hook.
    const configFile = path.resolve('wakusei.config.ts')
    for (const onChange of watcherCallbacks) onChange('change', configFile)
    for (const onChange of watcherCallbacks) onChange('change', configFile)
    expect(plugin.handleHotUpdate({ file: configFile, server })).toStrictEqual([])
    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(2)
    })

    expect(server.ssrLoadModule).toHaveBeenCalledTimes(2)
    expect(log.mock.calls).toStrictEqual([
      ['🪐 wakusei'],
      ['✅ wakusei: generated successfully'],
      ['🪐 wakusei'],
      ['✅ wakusei: generated successfully'],
    ])
  })

  it('loads the config, watches it and its input documents, generates and reloads', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server, addedPaths, sentMessages, watcherCallbacks } = createMockServer(base)
    plugin.configureServer(server)

    await vi.waitFor(() => {
      expect(sentMessages).toStrictEqual([{ type: 'full-reload' }])
    })
    const cwd = process.cwd()
    expect(addedPaths).toStrictEqual([
      path.join(cwd, 'wakusei.config.ts'),
      path.join(cwd, 'openapi.yaml'),
      path.join(cwd, '**/*.yaml'),
      path.join(cwd, '**/*.json'),
      path.join(cwd, '**/*.tsp'),
    ])
    expect(watcherCallbacks).toHaveLength(1)
    expect(
      vi
        .mocked(server.ssrLoadModule)
        .mock.calls[0]?.[0].startsWith(`${path.join(cwd, 'wakusei.config.ts')}?t=`),
    ).toBe(true)
    expect(server.moduleGraph.invalidateAll).toHaveBeenCalledTimes(1)
    expect(log.mock.calls).toStrictEqual([['🪐 wakusei'], ['✅ wakusei: generated successfully']])
    expect(fs.existsSync('src/handlers/posts.ts')).toBe(true)
  })

  it('invalidates the cached config module when Vite resolves it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server, sentMessages } = createMockServer(base)
    const moduleNode = { id: '/resolved/wakusei.config.ts' }
    server.pluginContainer.resolveId = () => Promise.resolve({ id: moduleNode.id })
    server.moduleGraph.getModuleById = () => moduleNode
    plugin.configureServer(server)

    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(1)
    })
    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledWith(moduleNode)
    expect(server.moduleGraph.invalidateAll).not.toHaveBeenCalled()
  })

  it.each([
    [
      'an invalid config',
      { input: 'openapi.yaml', mode: 'server' },
      '❌ wakusei config: Invalid config: output: Missing key',
    ],
    ['a config that is not an object', 42, '❌ wakusei config: Config must export default object'],
  ])('reports %s and generates nothing', async (_, config, message) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server, sentMessages } = createMockServer(config)
    plugin.configureServer(server)

    await vi.waitFor(() => {
      expect(error.mock.calls).toStrictEqual([[message]])
    })
    expect(sentMessages).toStrictEqual([])
    expect(fs.existsSync('src')).toBe(false)
  })

  it('reports a module that fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server } = createMockServer(base)
    server.ssrLoadModule = () => Promise.reject(new Error('module load failed'))
    plugin.configureServer(server)

    await vi.waitFor(() => {
      expect(error.mock.calls).toStrictEqual([['❌ wakusei config: module load failed']])
    })
  })

  it('keeps hand-written handler bodies when the spec changes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server, sentMessages, watcherCallbacks } = createMockServer(base)
    plugin.configureServer(server)
    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(1)
    })
    const handler = 'src/handlers/posts.ts'
    fs.writeFileSync(
      handler,
      fs
        .readFileSync(handler, 'utf8')
        .replace(
          '.handler(async ({ input }) => {})',
          '.handler(async ({ input }) => {\n  return []\n})',
        ),
    )

    for (const onChange of watcherCallbacks) onChange('change', path.resolve('openapi.yaml'))
    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(2)
    })

    expect(fs.readFileSync(handler, 'utf8')).toBe(`import { os } from '@orpc/server'

export const getPosts = os.route({ method: 'GET', path: '/posts' }).handler(async ({ input }) => {
  return []
})
`)
  })

  it('empties the split schemas directory before regenerating it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    fs.mkdirSync('src/schemas', { recursive: true })
    fs.writeFileSync('src/schemas/removed.ts', 'export const RemovedSchema = 1\n')
    const plugin = wakuseiVite()
    const { server, sentMessages } = createMockServer({
      ...base,
      components: { schemas: { output: 'src/schemas', split: true } },
    })
    plugin.configureServer(server)

    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(1)
    })
    expect(fs.readdirSync('src/schemas').sort()).toStrictEqual(['draft.ts', 'index.ts', 'post.ts'])
    expect(log.mock.calls[1]).toStrictEqual(['🧹 schemas: cleaned 1 files'])
  })

  it('removes outputs the edited config no longer names', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const plugin = wakuseiVite()
    const { server, sentMessages, watcherCallbacks, state } = createMockServer({
      ...base,
      components: { output: 'src/components/api.ts' },
    })
    plugin.configureServer(server)
    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(1)
    })
    expect(fs.existsSync('src/components/api.ts')).toBe(true)

    state.config = base
    for (const onChange of watcherCallbacks) onChange('change', path.resolve('wakusei.config.ts'))
    await vi.waitFor(() => {
      expect(sentMessages).toHaveLength(2)
    })

    expect(fs.readdirSync('src/components')).toStrictEqual(['index.ts'])
    expect(log.mock.calls).toContainEqual([`🧹 cleanup: ${path.resolve('src/components/api.ts')}`])
  })
})
