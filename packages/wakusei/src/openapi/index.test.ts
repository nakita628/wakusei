import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { OpenAPIError, parseOpenAPI } from './index.js'

describe('parseOpenAPI', () => {
  it('parses a document through oas-truth', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-openapi-'))
    const file = path.join(dir, 'openapi.yaml')
    fs.writeFileSync(file, "openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths: {}\n")
    const openapi = await Effect.runPromise(parseOpenAPI(file))
    fs.rmSync(dir, { recursive: true, force: true })
    expect(openapi).toStrictEqual({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {},
    })
  })

  it('turns an unreadable document into OpenAPIError', async () => {
    const error = await Effect.runPromise(Effect.flip(parseOpenAPI('/nonexistent/openapi.yaml')))
    expect(error).toBeInstanceOf(OpenAPIError)
    expect(error.message.startsWith('Error opening file ')).toBe(true)
  })
})
