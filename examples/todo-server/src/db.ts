import { ORPCError } from '@orpc/server'

import type { TodoSchema } from './components'

export const todos = new Map<string, TodoSchema>()

export function getTodo(id: string) {
  const todo = todos.get(id)
  if (!todo) throw new ORPCError('NOT_FOUND')
  return todo
}
