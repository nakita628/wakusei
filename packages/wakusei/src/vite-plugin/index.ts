// oxlint-disable no-console -- the plugin reports generation progress to the Vite terminal
import path from 'node:path'

import { Console, Effect, FileSystem, Result, Semaphore } from 'effect'

import type { Config } from '../config/index.js'
import { ConfigError, DEFAULT_CONFIG_FILE, parseConfig } from '../config/index.js'
import { orpc } from '../core/index.js'
import { resolveLayout } from '../core/layout.js'
import { fileSystemLayer } from '../file/index.js'

type ViteDevServer = {
  watcher: {
    add: (paths: string | readonly string[]) => void
    on: (event: 'all', callback: (eventType: string, filePath: string) => void) => void
  }
  ws: { send: (payload: { type: string; [k: string]: unknown }) => void }
  pluginContainer: { resolveId: (moduleId: string) => Promise<{ id: string } | null> }
  moduleGraph: {
    invalidateModule: (module: { id?: string } | null) => void
    invalidateAll: () => void
    getModuleById: (moduleId: string) => { id?: string } | null
  }
  ssrLoadModule: (moduleId: string) => Promise<{ [k: string]: unknown }>
}

function toAbsolutePath(relativePath: string) {
  return path.resolve(process.cwd(), relativePath)
}

function isInputFile(filePath: string, inputDirectory: string) {
  return (
    filePath.startsWith(inputDirectory) &&
    (filePath.endsWith('.yaml') || filePath.endsWith('.json') || filePath.endsWith('.tsp'))
  )
}

function debounce(delayMs: number, callback: () => void) {
  const timerStorage = new WeakMap<() => void, ReturnType<typeof setTimeout>>()
  const wrapped = () => {
    const prev = timerStorage.get(wrapped)
    if (prev !== undefined) clearTimeout(prev)
    timerStorage.set(wrapped, setTimeout(callback, delayMs))
  }
  return wrapped
}

function toConfigError(error: unknown) {
  return new ConfigError({ message: error instanceof Error ? error.message : String(error) })
}

/**
 * Loads the config through Vite's module graph, invalidating the cached copy first so an
 * edit to the config file is seen.
 */
function readConfigWithHotReload(server: ViteDevServer) {
  return Effect.gen(function* () {
    const absoluteConfigPath = toAbsolutePath(DEFAULT_CONFIG_FILE)
    const resolved = yield* Effect.tryPromise({
      try: () => server.pluginContainer.resolveId(absoluteConfigPath),
      catch: toConfigError,
    })
    const moduleNode = resolved ? server.moduleGraph.getModuleById(resolved.id) : undefined
    if (moduleNode) server.moduleGraph.invalidateModule(moduleNode)
    if (!resolved) server.moduleGraph.invalidateAll()
    const loadedModule = yield* Effect.tryPromise({
      try: () => server.ssrLoadModule(`${absoluteConfigPath}?t=${String(Date.now())}`),
      catch: toConfigError,
    })
    const defaultExport = loadedModule.default
    if (typeof defaultExport !== 'object' || defaultExport === null) {
      return yield* new ConfigError({ message: 'Config must export default object' })
    }
    return yield* parseConfig(defaultExport)
  })
}

/**
 * Every filesystem question the plugin asks is advisory — it decides what to clean up,
 * never whether the build is valid — so a path it cannot read reads as absent and the dev
 * server keeps running.
 */
function statOrNull(target: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.stat(target).pipe(Effect.orElseSucceed(() => null))
  })
}

/** Removes a path, answering whether it was removed. */
function removeQuietly(target: string, recursive = false) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.remove(target, { recursive, force: true }).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    )
  })
}

/** Deletes the `.ts` files directly inside the split schemas directory before it is regenerated. */
function cleanupSplitDir(directory: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const names = yield* fs
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed((): readonly string[] => []))
    const files = names
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => path.join(directory, entry))
    const infos = yield* Effect.all(files.map(statOrNull), { concurrency: 'unbounded' })
    const removed = yield* Effect.all(
      files.filter((_, index) => infos[index]?.type === 'File').map((file) => removeQuietly(file)),
      { concurrency: 'unbounded' },
    )
    const count = removed.filter(Boolean).length
    return count > 0 ? `🧹 schemas: cleaned ${String(count)} files` : undefined
  })
}

/**
 * The fully generated outputs: the component modules (the split schemas directory as a
 * whole), the contract, or the single file. Handler directories are left out: they hold
 * hand-written handler bodies, and the generator already removes the files no route maps to.
 */
function extractOutputPaths(config: Config) {
  if (config.output.endsWith('.ts')) return [toAbsolutePath(config.output)]
  const layout = resolveLayout(config)
  return [
    layout.schemas.file,
    ...layout.components.map((target) => target.file),
    ...(layout.contract === undefined ? [] : [layout.contract]),
  ]
}

/** Removes generated outputs the previous config wrote and the current one no longer names. */
function cleanupStaleOutputs(previousConfig: Config, currentConfig: Config) {
  return Effect.gen(function* () {
    const current = new Set(extractOutputPaths(currentConfig))
    const stalePaths = [...new Set(extractOutputPaths(previousConfig))].filter(
      (stale) => !current.has(stale),
    )
    const infos = yield* Effect.all(stalePaths.map(statOrNull), { concurrency: 'unbounded' })
    const removed = yield* Effect.all(
      stalePaths.map((stale, index) => {
        const type = infos[index]?.type
        if (type === 'Directory') return removeQuietly(stale, true)
        if (type === 'File' && stale.endsWith('.ts')) return removeQuietly(stale)
        return Effect.succeed(false)
      }),
      { concurrency: 'unbounded' },
    )
    return stalePaths.filter((_, index) => removed[index])
  })
}

/**
 * Empties the split schemas directory so a schema the spec no longer names does not
 * survive, then runs the generator. Handler directories are not emptied: the handler
 * bodies in them survive only through the merge with the existing files. A failure is
 * reported as a log line rather than raised, so the dev server keeps running.
 */
function runGeneration(config: Config) {
  return Effect.gen(function* () {
    const layout = config.output.endsWith('.ts') ? undefined : resolveLayout(config)
    const cleaned =
      layout && !layout.aggregate && layout.schemas.split
        ? yield* cleanupSplitDir(layout.schemas.file)
        : undefined
    const result = yield* Effect.result(orpc(config))
    return [
      ...(cleaned === undefined ? [] : [cleaned]),
      Result.isSuccess(result)
        ? '✅ wakusei: generated successfully'
        : `❌ wakusei: ${result.failure.message}`,
    ]
  })
}

function addInputGlobsToWatcher(server: ViteDevServer, absoluteInputPath: string) {
  const inputDirectory = path.dirname(absoluteInputPath)
  server.watcher.add([
    absoluteInputPath,
    path.join(inputDirectory, '**/*.yaml'),
    path.join(inputDirectory, '**/*.json'),
    path.join(inputDirectory, '**/*.tsp'),
  ])
  return inputDirectory
}

/** The plugin's boundary: Vite's hooks are Promise/callback APIs, the generators are Effects. */
function run<A>(program: Effect.Effect<A, never, FileSystem.FileSystem>) {
  return Effect.runPromise(program.pipe(Effect.provide(fileSystemLayer)))
}

export function wakuseiVite(): any {
  // Intentional `const` + mutable property pattern for state spanning Vite lifecycle hooks
  // (configureServer / handleHotUpdate / watcher callbacks).
  const pluginState: {
    current: Config | null
    inputDirectory: string | null
    /** Whether the changes waiting on the debounce include the config file itself. */
    configChanged: boolean
  } = {
    current: null,
    inputDirectory: null,
    configChanged: false,
  }
  const absoluteConfigFilePath = toAbsolutePath(DEFAULT_CONFIG_FILE)
  // One run at a time. Two runs in flight would each read, merge and rewrite the same handler
  // files, and one reading a file the other is halfway through writing drops its handler bodies.
  // A change that arrives mid-run waits and runs after, reading the state as it is by then.
  const oneRunAtATime = Semaphore.withPermit(Semaphore.makeUnsafe(1))

  function regenerate(server?: ViteDevServer) {
    return Effect.gen(function* () {
      if (!pluginState.current) return
      yield* Console.log('🪐 wakusei')
      const logs = yield* runGeneration(pluginState.current)
      for (const log of logs) yield* Console.log(log)
      if (server) server.ws.send({ type: 'full-reload' })
    })
  }

  /** Loads the config; on success, remembers it and starts watching its input documents. */
  function loadConfig(server: ViteDevServer) {
    return Effect.gen(function* () {
      const next = yield* Effect.result(readConfigWithHotReload(server))
      if (Result.isFailure(next)) {
        yield* Console.error(`❌ wakusei config: ${next.failure.message}`)
        return false
      }
      if (pluginState.current) {
        const cleaned = yield* cleanupStaleOutputs(pluginState.current, next.success)
        for (const stale of cleaned) yield* Console.log(`🧹 cleanup: ${stale}`)
      }
      pluginState.current = next.success
      pluginState.inputDirectory = addInputGlobsToWatcher(
        server,
        toAbsolutePath(next.success.input),
      )
      return true
    })
  }

  /** Reloads the config first when it is among the changes, then regenerates. */
  function handleChanges(server: ViteDevServer) {
    return Effect.gen(function* () {
      const configChanged = pluginState.configChanged
      pluginState.configChanged = false
      if (configChanged && !(yield* loadConfig(server))) return
      yield* regenerate(server)
    })
  }

  function start(server: ViteDevServer) {
    return Effect.gen(function* () {
      if (yield* loadConfig(server)) yield* regenerate(server)
    })
  }

  return {
    name: 'wakusei-vite',

    // The watcher in configureServer is what reacts to the config file. This hook only keeps
    // Vite from treating the SSR-loaded config as a module update; starting a run here too
    // regenerated twice for every save.
    handleHotUpdate(context: { file: string; server: ViteDevServer }) {
      return path.resolve(context.file) === absoluteConfigFilePath ? [] : undefined
    },
    buildStart() {
      // Dev-only: handled by configureServer
      return Promise.resolve()
    },
    configureServer(server: ViteDevServer) {
      server.watcher.add(absoluteConfigFilePath)
      // One debounce for the config and the input documents alike: an editor reports a save as
      // several events, and a save that touches both still yields one reload and one run.
      const scheduleChanges = debounce(200, () => {
        void run(oneRunAtATime(handleChanges(server)))
      })
      server.watcher.on('all', (_eventType, filePath) => {
        const absoluteChanged = path.resolve(filePath)
        if (absoluteChanged === absoluteConfigFilePath) {
          pluginState.configChanged = true
          scheduleChanges()
          return
        }
        if (
          pluginState.inputDirectory &&
          isInputFile(absoluteChanged, pluginState.inputDirectory)
        ) {
          scheduleChanges()
        }
      })
      run(oneRunAtATime(start(server))).catch((error: unknown) => {
        console.error('❌ wakusei watch error:', error)
      })
    },
  }
}
