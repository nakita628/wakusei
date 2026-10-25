import { oc } from '@orpc/contract'
import * as z from 'zod'

import { TodoSchema } from './components'

export const contract = {
  getTodos: oc
    .route({ method: 'GET', path: '/todos', successDescription: 'All todos' })
    .output(z.array(TodoSchema)),
  postTodos: oc
    .route({ method: 'POST', path: '/todos', successDescription: 'The created todo' })
    .input(z.object({ title: z.string().min(1) }))
    .output(TodoSchema),
  deleteTodosId: oc
    .route({
      method: 'DELETE',
      path: '/todos/{id}',
      successStatus: 204,
      successDescription: 'Deleted',
    })
    .input(z.object({ id: z.string() })),
  patchTodosId: oc
    .route({ method: 'PATCH', path: '/todos/{id}', successDescription: 'The updated todo' })
    .input(z.object({ id: z.string(), done: z.boolean() }))
    .output(TodoSchema),
}
