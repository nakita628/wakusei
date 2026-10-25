import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { FormatError } from '../format/index.js'
import { runGenerator, runGeneratorError } from '../testing/index.js'
import { emit, emitFiles } from './index.js'

const dirs: string[] = []

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-emit-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('emit', () => {
  it('formats the code and writes it, creating the directory', async () => {
    const dir = path.join(tmpDir(), 'a', 'b')
    await runGenerator(emit('const x = "1";', dir, path.join(dir, 'out.ts')))
    expect(fs.readFileSync(path.join(dir, 'out.ts'), 'utf8')).toBe("const x = '1'\n")
  })

  it('fails with FormatError and writes nothing for invalid code', async () => {
    const dir = tmpDir()
    const error = await runGeneratorError(emit('const = ;', dir, path.join(dir, 'out.ts')))
    expect(error).toStrictEqual(new FormatError({ message: 'Unexpected token' }))
    expect(fs.existsSync(path.join(dir, 'out.ts'))).toBe(false)
  })
})

describe('emitFiles', () => {
  it('writes nothing when any file fails to format', async () => {
    const dir = tmpDir()
    const error = await runGeneratorError(
      emitFiles([
        { path: path.join(dir, 'a.ts'), code: 'const a = 1' },
        { path: path.join(dir, 'b.ts'), code: 'const = ;' },
        { path: path.join(dir, 'c.ts'), code: 'const c = 1' },
      ]),
    )
    expect(error._tag).toBe('FormatError')
    expect(fs.readdirSync(dir)).toStrictEqual([])
  })

  it('writes every file, creating each directory once', async () => {
    const dir = tmpDir()
    await runGenerator(
      emitFiles([
        { path: path.join(dir, 'x', 'a.ts'), code: 'const a = 1' },
        { path: path.join(dir, 'x', 'b.ts'), code: 'const b = 2' },
        { path: path.join(dir, 'y', 'c.ts'), code: 'const c = 3' },
      ]),
    )
    expect(
      ['x/a.ts', 'x/b.ts', 'y/c.ts'].map((file) => fs.readFileSync(path.join(dir, file), 'utf8')),
    ).toStrictEqual(['const a = 1\n', 'const b = 2\n', 'const c = 3\n'])
  })
})
