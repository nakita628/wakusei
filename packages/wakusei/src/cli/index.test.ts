import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Console, Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { wakusei } from './index.js'

const ENTRY_URL = new URL('../index.ts', import.meta.url).href
// oxlint-disable-next-line no-control-regex -- the help renderer colors its output
const ANSI = /\u001B\[[0-9;]*m/gu

const SPEC = `openapi: 3.1.0
info: { title: Ping, version: 1.0.0 }
paths:
  /ping:
    get:
      responses:
        '200':
          description: pong
          content:
            application/json:
              schema: { type: string }
`

/**
 * Runs the command against argv the way the executable does. `--help`, the error block
 * and the success message all go through `Console`, so this captures what a user sees.
 */
async function runCli(argv: readonly string[], entryUrl: string = ENTRY_URL) {
  const stdout: string[] = []
  const stderr: string[] = []
  const recorder: Console.Console = Object.assign(Object.create(console), {
    log: (...args: readonly unknown[]) => stdout.push(args.map(String).join(' ')),
    error: (...args: readonly unknown[]) => stderr.push(args.map(String).join(' ')),
  })
  const exit = await Effect.runPromiseExit(
    wakusei(argv, entryUrl).pipe(
      Effect.provideService(Console.Console, recorder),
      Effect.provide(NodeServices.layer),
    ),
  )
  return {
    ok: Exit.isSuccess(exit),
    stdout: stdout.join('\n').replaceAll(ANSI, ''),
    stderr: stderr.join('\n').replaceAll(ANSI, ''),
  }
}

const originalCwd = process.cwd()
const dirs: string[] = []

function useTmpDir(files: { readonly [name: string]: string } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-cli-')))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  process.chdir(dir)
  return dir
}

afterEach(() => {
  process.chdir(originalCwd)
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('wakusei', { timeout: 30_000 }, () => {
  it('runs ./wakusei.config.ts and reports what it generated', async () => {
    useTmpDir({
      'openapi.yaml': SPEC,
      'wakusei.config.ts':
        "export default { input: 'openapi.yaml', mode: 'server', output: '.', schema: 'valibot' }\n",
    })

    const result = await runCli([])

    expect(result).toStrictEqual({
      ok: true,
      stdout: '🪐 wakusei: openapi.yaml → . (server, valibot) ✅',
      stderr: '',
    })
    expect(fs.readFileSync('src/handlers/ping.ts', 'utf8')).toBe(`import { os } from '@orpc/server'
import * as v from 'valibot'

export const getPing = os
  .route({ method: 'GET', path: '/ping', successDescription: 'pong' })
  .output(v.string())
  .handler(async ({ input }) => {})
`)
  })

  it.each([['--config'], ['-c']])('runs the config file named by %s', async (flag) => {
    useTmpDir({
      'spec/openapi.yaml': SPEC,
      'config/api.config.ts':
        "export default { input: 'spec/openapi.yaml', mode: 'contract', output: 'gen' }\n",
    })

    const result = await runCli([flag, 'config/api.config.ts'])

    expect(result.stdout).toBe('🪐 wakusei: spec/openapi.yaml → gen (contract, zod) ✅')
    expect(fs.existsSync('gen/src/contract.ts')).toBe(true)
  })

  it('writes server handlers under . for a bare <input>', async () => {
    const dir = useTmpDir({ 'openapi.yaml': SPEC })

    const result = await runCli(['openapi.yaml'])

    expect(result).toStrictEqual({
      ok: true,
      stdout: `🪐 wakusei: ${path.join(dir, 'openapi.yaml')} → . (server, zod) ✅`,
      stderr: '',
    })
    expect(fs.existsSync('src/handlers/ping.ts')).toBe(true)
  })

  it('writes a single contract module for <input> -o <file>.ts, ignoring a config file', async () => {
    useTmpDir({
      'openapi.yaml': SPEC,
      'wakusei.config.ts': "export default { input: 'nope.yaml', mode: 'server', output: 'x' }\n",
    })

    const result = await runCli(['openapi.yaml', '-o', 'contract.ts', '--schema', 'arktype'])

    expect(result.ok).toBe(true)
    expect(fs.readFileSync('contract.ts', 'utf8')).toBe(`import { oc } from '@orpc/contract'
import { type } from 'arktype'

export const contract = {
  getPing: oc
    .route({ method: 'GET', path: '/ping', successDescription: 'pong' })
    .output(type('string')),
}
`)
  })

  it('answers a missing default config with the usage and the path it looked for', async () => {
    const dir = useTmpDir()

    const result = await runCli([])

    expect(result.ok).toBe(false)
    expect(result.stdout.startsWith('DESCRIPTION\n')).toBe(true)
    expect(result.stderr.trim()).toBe(
      `ERROR\n  Config not found: ${path.join(dir, 'wakusei.config.ts')}\nCreate wakusei.config.ts in the current directory, or pass <input>. See https://github.com/nakita628/wakusei#full-config-reference for an example.`,
    )
  })

  it('rejects --config next to <input>', async () => {
    useTmpDir({ 'openapi.yaml': SPEC, 'wakusei.config.ts': 'export default {}\n' })

    const result = await runCli(['openapi.yaml', '--config', 'wakusei.config.ts'])

    expect(result.ok).toBe(false)
    expect(result.stderr.trim()).toBe(
      'ERROR\n  --config cannot be combined with <input>, --output or --schema. A config file already names its own input and outputs.',
    )
  })

  it.each([[['-o', 'out.ts']], [['--schema', 'zod']]])(
    'rejects %j without <input>',
    async (argv) => {
      useTmpDir()

      const result = await runCli(argv)

      expect(result.ok).toBe(false)
      expect(result.stderr.trim()).toBe('ERROR\n  --output and --schema need an <input> document.')
    },
  )

  it('rejects an <input> that is not an OpenAPI or TypeSpec document', async () => {
    useTmpDir({ 'spec.txt': SPEC })

    const result = await runCli(['spec.txt'])

    expect(result.ok).toBe(false)
    expect(result.stderr.includes('an OpenAPI (.yaml, .json) or TypeSpec (.tsp) document')).toBe(
      true,
    )
  })

  it('rejects a --config file that does not exist', async () => {
    const dir = useTmpDir()

    const result = await runCli(['--config', 'nope.config.ts'])

    expect(result.ok).toBe(false)
    expect(result.stderr.trim()).toBe(
      `ERROR\n  Invalid value for flag --config: "nope.config.ts". Expected: Path does not exist: ${path.join(dir, 'nope.config.ts')}`,
    )
  })

  it('reports an invalid config without the usage', async () => {
    useTmpDir({
      'wakusei.config.ts':
        "export default { input: 'a.yaml', mode: 'server', output: '.', schema: 'yup' }\n",
    })

    const result = await runCli([])

    expect(result).toStrictEqual({
      ok: false,
      stdout: '',
      stderr: '\nERROR\n  Invalid config: schema: Expected "zod" | "valibot" | "arktype"',
    })
  })

  it('names a pathAlias that would break a generated import', async () => {
    useTmpDir({
      'openapi.yaml': SPEC,
      'wakusei.config.ts':
        "export default { input: 'openapi.yaml', mode: 'server', output: '.', pathAlias: 'foo bar' }\n",
    })

    const result = await runCli([])

    expect(result).toStrictEqual({
      ok: false,
      stdout: '',
      stderr:
        '\nERROR\n  Invalid config: pathAlias: must be an import prefix, with no whitespace or quotes',
    })
  })

  it('reports a generation failure', async () => {
    useTmpDir({
      'wakusei.config.ts':
        "export default { input: 'missing.yaml', mode: 'server', output: '.' }\n",
    })

    const result = await runCli([])

    expect(result.ok).toBe(false)
    expect(result.stderr.trim().startsWith('ERROR\n  Error opening file ')).toBe(true)
  })

  it('lists its flags in --help', async () => {
    useTmpDir()

    const result = await runCli(['--help'])

    const flags = result.stdout
      .slice(result.stdout.indexOf('FLAGS\n'), result.stdout.indexOf('GLOBAL FLAGS'))
      .split('\n')
      .filter((line) => line.startsWith('  --'))
      .map((line) => line.trim().replaceAll(/ {2,}/gu, '  '))
    expect(flags).toStrictEqual([
      '--output, -o output  Contract mode: a .ts file for a single module, or a directory (without -o: server mode into .)',
      '--schema lib  Validation library for <input> (default: zod) (choices: zod, valibot, arktype)',
      '--config, -c file  Config file to run (default: ./wakusei.config.ts)',
      '--watch, -w  Rerun the config on every change to its input documents or itself',
    ])
  })

  it('prints the version from package.json', async () => {
    useTmpDir()
    const manifest: unknown = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    )
    const version =
      typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? String(manifest.version)
        : ''

    const result = await runCli(['--version'])

    expect(result).toStrictEqual({ ok: true, stdout: `wakusei v${version}`, stderr: '' })
  })

  it('reports a broken install when package.json cannot be read', async () => {
    const dir = useTmpDir()

    const result = await runCli(['--version'], new URL(`file://${dir}/bin/index.js`).href)

    expect(result.ok).toBe(false)
    expect(result.stderr.includes('Cannot read the version from package.json')).toBe(true)
  })
})
