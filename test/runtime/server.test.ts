// Drives the generated routers over HTTP through oRPC's OpenAPIHandler: the procedures are
// the generated chains (route, coerced input, output) with the handler bodies from
// overlays/handlers merged in, so each request checks generation, merge and validation at once.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { OpenAPIHandler } from '@orpc/openapi/fetch'
import type { AnyRouter } from '@orpc/server'
import { describe, expect, it } from 'vite-plus/test'

const generated = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '__generated__')

/** A request against one case's router, answered with its status and parsed body. */
async function makeRequest(name: string) {
  const router: AnyRouter = await import(
    pathToFileURL(path.join(generated, name, 'src', 'handlers', 'index.ts')).href
  )
  const handler = new OpenAPIHandler(router)
  return async (method: string, url: string, body?: unknown) => {
    const { matched, response } = await handler.handle(
      new Request(`http://localhost${url}`, {
        method,
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      }),
    )
    if (!matched) return { status: 'unmatched' }
    const text = await response.text()
    const parsed: unknown = text === '' ? undefined : JSON.parse(text)
    return {
      status: response.status,
      body:
        response.status >= 400 && typeof parsed === 'object' && parsed !== null && 'code' in parsed
          ? { code: parsed.code }
          : parsed,
    }
  }
}

// zod-alias imports through `@/`, which only its tsconfig maps; it is covered by typecheck.
describe.each(['zod-server', 'valibot-server', 'arktype-server', 'zod-template'])('%s', (name) => {
  it('coerces query parameters from the wire and validates them', async () => {
    const request = await makeRequest(name)
    expect(await request('GET', '/posts?limit=10&status=published')).toStrictEqual({
      status: 200,
      body: [{ id: 10, title: 'post', status: 'published' }],
    })
    expect(await request('GET', '/posts?limit=0')).toStrictEqual({
      status: 400,
      body: { code: 'BAD_REQUEST' },
    })
    expect(await request('GET', '/posts?status=archived')).toStrictEqual({
      status: 400,
      body: { code: 'BAD_REQUEST' },
    })
  })

  it('validates a request body and answers with the success status', async () => {
    const request = await makeRequest(name)
    expect(await request('POST', '/posts', { title: 'hi' })).toStrictEqual({
      status: 201,
      body: { id: 1, title: 'hi', status: 'draft' },
    })
    expect(await request('POST', '/posts', {})).toStrictEqual({
      status: 400,
      body: { code: 'BAD_REQUEST' },
    })
  })

  it('merges path parameters with the body and answers a recursive schema', async () => {
    const request = await makeRequest(name)
    expect(await request('GET', '/posts/5')).toStrictEqual({
      status: 200,
      body: {
        id: 5,
        title: 'post',
        status: 'published',
        replies: [{ id: 6, title: 'reply', status: 'draft' }],
        author: { name: 'author', posts: [] },
      },
    })
    expect(await request('PUT', '/posts/3', { title: 'x' })).toStrictEqual({
      status: 200,
      body: { id: 3, title: 'x', status: 'draft' },
    })
    expect(await request('DELETE', '/posts/3')).toStrictEqual({ status: 204, body: undefined })
  })

  it('resolves a colliding schema name, a self-cycle and a webhook', async () => {
    const request = await makeRequest(name)
    expect(await request('GET', '/users/abc')).toStrictEqual({ status: 200, body: { id: 'abc' } })
    expect(await request('GET', '/tree')).toStrictEqual({
      status: 200,
      body: { children: [{ children: [] }, {}] },
    })
    expect(
      await request('POST', '/postPublished', { id: 1, title: 'published', status: 'published' }),
    ).toStrictEqual({ status: 200, body: undefined })
  })
})
