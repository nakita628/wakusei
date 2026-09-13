import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Console, Effect, Fiber } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { wakusei } from './index.js'

// Its own file: every case here forks a watcher that has to be interrupted, which does not
// fit the run-to-completion shape of the rest of the CLI suite.

const ENTRY_URL = new URL('../index.ts', import.meta.url).href
// oxlint-disable-next-line no-control-regex -- the help renderer colors its output
const ANSI = /\u001B\[[0-9;]*m/gu

const minimalOpenapi = {
  openapi: '3.1.0',
  info: { title: 'Watch', version: '1.0.0' },
  paths: { '/items': { get: { responses: { '200': { description: 'OK' } } } } },
}

const withWidgets = {
  ...minimalOpenapi,
  paths: { '/widgets': { get: { responses: { '200': { description: 'OK' } } } } },
}

const originalCwd = process.cwd()
let tmpDir = ''

function useTmpDir(prefix: string) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  tmpDir = dir
  process.chdir(dir)
  return dir
}

afterEach(() => {
  process.chdir(originalCwd)
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = ''
})

/**
 * Starts the CLI in the background and hands back the lines it has printed so far. A watch
 * run never completes on its own, so the fiber is what the test interrupts — the same thing
 * Ctrl-C does to the real command.
 */
function startCli(argv: readonly string[]) {
  const lines: string[] = []
  const recorder: Console.Console = Object.assign(Object.create(console), {
    log: (...args: readonly unknown[]) => lines.push(args.map(String).join(' ')),
    error: (...args: readonly unknown[]) => lines.push(args.map(String).join(' ')),
  })
  const fiber = Effect.runFork(
    wakusei(argv, ENTRY_URL).pipe(
      Effect.provideService(Console.Console, recorder),
      Effect.provide(NodeServices.layer),
    ),
  )
  return { fiber, output: () => lines.join('\n').replaceAll(ANSI, '') }
}

/**
 * Polls until `condition` holds, so a test waits on the watcher rather than on a clock. The
 * budget is a starvation allowance, not an expectation: each case waits on real generation
 * passes while the rest of the suite runs in parallel.
 */
async function until(condition: () => boolean, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  const poll = async (): Promise<boolean> => {
    if (condition()) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 50))
    return poll()
  }
  return poll()
}

/** How long a written edit is given to reach the watcher before it is written again. */
const REWRITE_AFTER = 5000

/**
 * Writes `content` to `file` until `condition` holds, and answers whether it ever did.
 *
 * `👀 Watching` is printed before the OS watcher is registered, and an edit that lands in
 * that window is never delivered. Writing once and waiting would be a race whose odds depend
 * on the machine's load, so the edit is repeated — every attempt is a real edit and a real
 * pass, and the repeat only costs anything when the first one lost the race.
 */
async function writeUntil(
  file: string,
  content: string,
  condition: () => boolean,
  timeoutMs = 90_000,
) {
  const deadline = Date.now() + timeoutMs
  const attempt = async (): Promise<boolean> => {
    fs.writeFileSync(file, content)
    if (await until(condition, REWRITE_AFTER)) return true
    if (Date.now() >= deadline) return false
    return attempt()
  }
  return attempt()
}

function contractConfig(input: string, output: string, schema = 'zod') {
  return `export default { input: '${input}', mode: 'contract', output: '${output}', schema: '${schema}' }\n`
}

// Long enough for every `until` in the slowest case to spend its full budget, so a real
// failure still reports as the assertion that failed rather than as a suite timeout.
describe('wakusei --watch', { timeout: 300_000 }, () => {
  it('picks up a change to the config file itself', async () => {
    const dir = useTmpDir('wakusei-watch-config-')
    const config = path.join(dir, 'wakusei.config.ts')
    fs.writeFileSync(path.join(dir, 'openapi.json'), JSON.stringify(minimalOpenapi))
    fs.writeFileSync(config, contractConfig('./openapi.json', './a.ts'))

    const cli = startCli(['--watch'])
    try {
      expect(await until(() => cli.output().includes('👀 Watching'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'a.ts'))).toBe(true)

      expect(
        await writeUntil(config, contractConfig('./openapi.json', './b.ts'), () =>
          fs.existsSync(path.join(dir, 'b.ts')),
        ),
      ).toBe(true)
    } finally {
      await Effect.runPromise(Fiber.interrupt(cli.fiber))
    }
  })

  // Also the plain "the document changed, so regenerate" case: the recovery write adds an
  // operation and the assertion is that it reached the output.
  it('keeps watching after a failing pass', async () => {
    const dir = useTmpDir('wakusei-watch-recover-')
    const input = path.join(dir, 'openapi.json')
    const contract = path.join(dir, 'contract.ts')
    fs.writeFileSync(input, JSON.stringify(minimalOpenapi))
    fs.writeFileSync(
      path.join(dir, 'wakusei.config.ts'),
      contractConfig('./openapi.json', './contract.ts'),
    )

    const cli = startCli(['--watch'])
    try {
      expect(await until(() => cli.output().includes('👀 Watching'))).toBe(true)

      expect(await writeUntil(input, '{ not json', () => cli.output().includes('❌'))).toBe(true)

      expect(
        await writeUntil(input, JSON.stringify(withWidgets), () =>
          fs.readFileSync(contract, 'utf8').includes('getWidgets'),
        ),
      ).toBe(true)
    } finally {
      await Effect.runPromise(Fiber.interrupt(cli.fiber))
    }
  })

  // A command asked to stay up and react to edits has to treat the first pass as a pass
  // like any other; otherwise one typo in the config ends the session.
  it('stays up when the config does not validate at startup', async () => {
    const dir = useTmpDir('wakusei-watch-bad-config-')
    const config = path.join(dir, 'wakusei.config.ts')
    fs.writeFileSync(path.join(dir, 'openapi.json'), JSON.stringify(minimalOpenapi))
    fs.writeFileSync(config, contractConfig('./openapi.json', './contract.ts', 'yup'))

    const cli = startCli(['--watch'])
    try {
      expect(await until(() => cli.output().includes('👀 Watching'))).toBe(true)
      expect(cli.output().split('\n')[0]).toBe(
        '❌ Invalid config: schema: Expected "zod" | "valibot" | "arktype"',
      )
      expect(fs.existsSync(path.join(dir, 'contract.ts'))).toBe(false)

      expect(
        await writeUntil(config, contractConfig('./openapi.json', './contract.ts'), () =>
          fs.existsSync(path.join(dir, 'contract.ts')),
        ),
      ).toBe(true)
    } finally {
      await Effect.runPromise(Fiber.interrupt(cli.fiber))
    }
  })

  // The directory to watch comes from the config, so a config that moves `input` has to
  // move the watcher with it rather than leaving it on the old directory.
  it('follows input to another directory when the config moves it', async () => {
    const dir = useTmpDir('wakusei-watch-moved-input-')
    const config = path.join(dir, 'wakusei.config.ts')
    const contract = path.join(dir, 'contract.ts')
    fs.mkdirSync(path.join(dir, 'a'))
    fs.mkdirSync(path.join(dir, 'b'))
    fs.writeFileSync(path.join(dir, 'a', 'openapi.json'), JSON.stringify(minimalOpenapi))
    fs.writeFileSync(path.join(dir, 'b', 'openapi.json'), JSON.stringify(minimalOpenapi))
    fs.writeFileSync(config, contractConfig('./a/openapi.json', './contract.ts'))

    const cli = startCli(['--watch'])
    try {
      expect(await until(() => cli.output().includes(path.join(dir, 'a')))).toBe(true)

      expect(
        await writeUntil(config, contractConfig('./b/openapi.json', './contract.ts'), () =>
          cli.output().includes(path.join(dir, 'b')),
        ),
      ).toBe(true)

      // Editing the document in the directory the config now names has to rerun. The round
      // restarted to follow it, so this is a second watcher with its own window.
      expect(
        await writeUntil(path.join(dir, 'b', 'openapi.json'), JSON.stringify(withWidgets), () =>
          fs.readFileSync(contract, 'utf8').includes('getWidgets'),
        ),
      ).toBe(true)
    } finally {
      await Effect.runPromise(Fiber.interrupt(cli.fiber))
    }
  })

  it('rejects --watch alongside a one-shot <input>', async () => {
    const dir = useTmpDir('wakusei-watch-one-shot-')
    const input = path.join(dir, 'openapi.json')
    fs.writeFileSync(input, JSON.stringify(minimalOpenapi))

    const cli = startCli([input, '--watch'])
    const exit = await Effect.runPromise(Fiber.await(cli.fiber))

    expect(exit._tag).toBe('Failure')
    expect(cli.output().split('\n').at(-1)?.trim()).toBe(
      '--watch runs a config file, so it cannot be combined with <input>, --output or --schema.',
    )
  })
})
