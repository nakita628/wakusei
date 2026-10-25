import { isDefinedError, ORPCError, safe } from '@orpc/client'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { createTodoClient } from './client'
import { router } from './router'
import { resetTodos } from './store'

// The client's requests go straight into the handler instead of over a socket.
const handler = new OpenAPIHandler(router)
const client = createTodoClient('http://localhost', async (input, init) => {
  const { response } = await handler.handle(new Request(input, init))
  return response ?? new Response('Not found', { status: 404 })
})

beforeEach(() => {
  resetTodos()
})

describe('todo client', () => {
  it('creates, lists, updates and deletes a todo', async () => {
    const todo = await client.postTodos({ title: 'Buy milk' })
    expect(todo).toMatchObject({ id: 1, title: 'Buy milk', status: 'open' })

    const updated = await client.patchTodosId({ id: '1', status: 'done' })
    expect(updated.status).toBe('done')

    expect(await client.getTodos({ status: 'open' })).toStrictEqual([])
    expect(await client.getTodos({ status: 'done' })).toStrictEqual([updated])

    await client.deleteTodosId({ id: '1' })
    expect(await client.getTodos({})).toStrictEqual([])
  })

  it('surfaces a missing todo as a NOT_FOUND error', async () => {
    const [error] = await safe(client.getTodosId({ id: '42' }))
    expect(error).toBeInstanceOf(ORPCError)
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404, message: 'No todo has id 42' })
    expect(isDefinedError(error)).toBe(false)
  })

  it('rejects input that does not match the OpenAPI schemas', async () => {
    const [error] = await safe(client.postTodos({ title: '' }))
    expect(error).toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })
})
