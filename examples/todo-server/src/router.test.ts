import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { router } from './router'
import { resetTodos } from './store'

const handler = new OpenAPIHandler(router)

/** Sends one request through the router and returns the status and parsed JSON body. */
async function request(method: string, url: string, body?: unknown) {
  const { response } = await handler.handle(
    new Request(`http://localhost${url}`, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    }),
  )
  const text = (await response?.text()) ?? ''
  return { status: response?.status, body: text === '' ? undefined : JSON.parse(text) }
}

beforeEach(() => {
  resetTodos()
})

describe('todo API', () => {
  it('creates, lists, updates and deletes a todo', async () => {
    const created = await request('POST', '/todos', { title: 'Buy milk' })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ id: 1, title: 'Buy milk', status: 'open' })

    expect((await request('GET', '/todos')).body).toHaveLength(1)

    const updated = await request('PATCH', '/todos/1', { status: 'done' })
    expect(updated).toMatchObject({ status: 200, body: { id: 1, status: 'done' } })

    expect((await request('GET', '/todos?status=open')).body).toStrictEqual([])
    expect((await request('GET', '/todos?status=done')).body).toHaveLength(1)

    expect((await request('DELETE', '/todos/1')).status).toBe(204)
    expect((await request('GET', '/todos/1')).status).toBe(404)
  })

  it('rejects input that does not match the OpenAPI schemas', async () => {
    expect((await request('POST', '/todos', { title: '' })).status).toBe(400)
    expect((await request('GET', '/todos?status=later')).status).toBe(400)
    expect((await request('GET', '/todos/0')).status).toBe(400)
  })

  it('answers 404 for a todo that does not exist', async () => {
    expect(await request('PATCH', '/todos/42', { title: 'x' })).toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'No todo has id 42' },
    })
  })
})
