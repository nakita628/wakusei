import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { runGenerator, runGeneratorError } from '../testing/index.js'
import { mkdir, readdir, readFile, unlink, writeFile } from './index.js'

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-file-'))
const dir = path.join(base, 'work')

beforeEach(() => {
  fs.mkdirSync(dir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('mkdir', () => {
  it('creates nested directories and accepts an existing one', async () => {
    const deep = path.join(dir, 'a', 'b')
    await runGenerator(mkdir(deep))
    await runGenerator(mkdir(deep))
    expect(fs.statSync(deep).isDirectory()).toBe(true)
  })

  it('fails when a file is in the way', async () => {
    fs.writeFileSync(path.join(dir, 'file'), '')
    const error = await runGeneratorError(mkdir(path.join(dir, 'file', 'sub')))
    expect(error._tag).toBe('PlatformError')
  })
})

describe('readdir', () => {
  it('lists entry names', async () => {
    fs.writeFileSync(path.join(dir, 'a.ts'), '')
    fs.writeFileSync(path.join(dir, 'b.ts'), '')
    expect([...(await runGenerator(readdir(dir)))].sort()).toStrictEqual(['a.ts', 'b.ts'])
  })

  // Every caller treats "the directory is not there yet" as "nothing in it".
  it('reads a missing directory as empty', async () => {
    expect(await runGenerator(readdir(path.join(dir, 'missing')))).toStrictEqual([])
  })
})

describe('readFile', () => {
  it('reads UTF-8 contents', async () => {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'const a = 1\n')
    expect(await runGenerator(readFile(path.join(dir, 'a.ts')))).toBe('const a = 1\n')
  })

  it('reads a missing file as null', async () => {
    expect(await runGenerator(readFile(path.join(dir, 'missing.ts')))).toBe(null)
  })

  it('fails on a directory', async () => {
    const error = await runGeneratorError(readFile(dir))
    expect(error._tag).toBe('PlatformError')
  })
})

describe('writeFile', () => {
  it('writes the contents', async () => {
    const file = path.join(dir, 'out.ts')
    await runGenerator(writeFile(file, 'x'))
    expect(fs.readFileSync(file, 'utf8')).toBe('x')
  })

  // An identical write is skipped so the Vite plugin's watcher does not see its own output.
  it('leaves an identical file untouched', async () => {
    const file = path.join(dir, 'out.ts')
    fs.writeFileSync(file, 'x')
    const past = new Date('2020-01-01')
    fs.utimesSync(file, past, past)
    await runGenerator(writeFile(file, 'x'))
    expect(fs.statSync(file).mtime.getTime()).toBe(past.getTime())
  })
})

describe('unlink', () => {
  it('removes a file and accepts a missing one', async () => {
    const file = path.join(dir, 'gone.ts')
    fs.writeFileSync(file, '')
    await runGenerator(unlink(file))
    await runGenerator(unlink(file))
    expect(fs.existsSync(file)).toBe(false)
  })
})
