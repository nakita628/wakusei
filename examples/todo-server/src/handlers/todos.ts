import { os } from '@orpc/server'
import * as z from 'zod'

import { TodoSchema } from '../components'
import { getTodo, todos } from '../db'

export const getTodos = os
  .route({ method: 'GET', path: '/todos', successDescription: 'All todos' })
  .output(z.array(TodoSchema))
  .handler(async ({ input }) => {
    return [...todos.values()]
  })

export const postTodos = os
  .route({ method: 'POST', path: '/todos', successDescription: 'The created todo' })
  .input(z.object({ title: z.string().min(1) }))
  .output(TodoSchema)
  .handler(async ({ input }) => {
    const todo = { id: crypto.randomUUID(), title: input.title, done: false }
    todos.set(todo.id, todo)
    return todo
  })

export const deleteTodosId = os
  .route({
    method: 'DELETE',
    path: '/todos/{id}',
    successStatus: 204,
    successDescription: 'Deleted',
  })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    todos.delete(input.id)
  })

export const patchTodosId = os
  .route({ method: 'PATCH', path: '/todos/{id}', successDescription: 'The updated todo' })
  .input(z.object({ id: z.string(), done: z.boolean() }))
  .output(TodoSchema)
  .handler(async ({ input }) => {
    const todo = { ...getTodo(input.id), done: input.done }
    todos.set(todo.id, todo)
    return todo
  })
