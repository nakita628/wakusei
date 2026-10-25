import { oc } from '@orpc/contract'
import * as v from 'valibot'

import { CreateTodoSchema, TodoSchema, TodoStatusSchema } from './components'

export const contract = {
  getTodos: oc
    .route({
      method: 'GET',
      path: '/todos',
      tags: ['todos'],
      summary: 'List todos',
      successDescription: 'The todos, oldest first',
    })
    .input(v.object({ status: v.optional(TodoStatusSchema) }))
    .output(v.array(TodoSchema)),
  postTodos: oc
    .route({
      method: 'POST',
      path: '/todos',
      tags: ['todos'],
      summary: 'Create a todo',
      successStatus: 201,
      successDescription: 'The created todo',
    })
    .input(CreateTodoSchema)
    .output(TodoSchema),
  getTodosId: oc
    .route({
      method: 'GET',
      path: '/todos/{id}',
      tags: ['todos'],
      summary: 'Get a todo',
      successDescription: 'The todo',
    })
    .input(
      v.object({
        id: v.pipe(v.string(), v.transform(Number), v.number(), v.safeInteger(), v.minValue(1)),
      }),
    )
    .output(TodoSchema),
  deleteTodosId: oc
    .route({
      method: 'DELETE',
      path: '/todos/{id}',
      tags: ['todos'],
      summary: 'Delete a todo',
      successStatus: 204,
      successDescription: 'Deleted',
    })
    .input(
      v.object({
        id: v.pipe(v.string(), v.transform(Number), v.number(), v.safeInteger(), v.minValue(1)),
      }),
    ),
  patchTodosId: oc
    .route({
      method: 'PATCH',
      path: '/todos/{id}',
      tags: ['todos'],
      summary: 'Update a todo',
      successDescription: 'The updated todo',
    })
    .input(
      v.object({
        id: v.pipe(v.string(), v.transform(Number), v.number(), v.safeInteger(), v.minValue(1)),
        title: v.optional(v.pipe(v.string(), v.minCodePoints(1), v.maxCodePoints(100))),
        status: v.optional(TodoStatusSchema),
      }),
    )
    .output(TodoSchema),
}
