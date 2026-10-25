import { os } from '@orpc/server'
import * as z from 'zod'

import { CreateTodoSchema, TodoSchema, TodoStatusSchema } from '../components'
import { notFound } from '../errors'
import { createTodo, deleteTodo, findTodo, listTodos, updateTodo } from '../store'

export const getTodos = os
  .route({
    method: 'GET',
    path: '/todos',
    tags: ['todos'],
    summary: 'List todos',
    successDescription: 'The todos, oldest first',
  })
  .input(z.object({ status: TodoStatusSchema.exactOptional() }))
  .output(z.array(TodoSchema))
  .handler(async ({ input }) => {
    return listTodos(input.status)
  })

export const postTodos = os
  .route({
    method: 'POST',
    path: '/todos',
    tags: ['todos'],
    summary: 'Create a todo',
    successStatus: 201,
    successDescription: 'The created todo',
  })
  .input(CreateTodoSchema)
  .output(TodoSchema)
  .handler(async ({ input }) => {
    return createTodo(input.title)
  })

export const getTodosId = os
  .route({
    method: 'GET',
    path: '/todos/{id}',
    tags: ['todos'],
    summary: 'Get a todo',
    successDescription: 'The todo',
  })
  .input(z.object({ id: z.coerce.number().int().min(1) }))
  .output(TodoSchema)
  .handler(async ({ input }) => {
    const todo = findTodo(input.id)
    if (todo === undefined) throw notFound(input.id)
    return todo
  })

export const deleteTodosId = os
  .route({
    method: 'DELETE',
    path: '/todos/{id}',
    tags: ['todos'],
    summary: 'Delete a todo',
    successStatus: 204,
    successDescription: 'Deleted',
  })
  .input(z.object({ id: z.coerce.number().int().min(1) }))
  .handler(async ({ input }) => {
    if (!deleteTodo(input.id)) throw notFound(input.id)
  })

export const patchTodosId = os
  .route({
    method: 'PATCH',
    path: '/todos/{id}',
    tags: ['todos'],
    summary: 'Update a todo',
    successDescription: 'The updated todo',
  })
  .input(
    z.object({
      id: z.coerce.number().int().min(1),
      title: z.string().min(1).max(100).exactOptional(),
      status: TodoStatusSchema.exactOptional(),
    }),
  )
  .output(TodoSchema)
  .handler(async ({ input }) => {
    const { id, ...patch } = input
    const todo = updateTodo(id, patch)
    if (todo === undefined) throw notFound(id)
    return todo
  })
