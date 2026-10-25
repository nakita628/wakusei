import { implement } from '@orpc/server'

import { contract } from '../contract'
import { getTodo, todos } from '../db'

const os = implement(contract)

export const getTodos = os.getTodos.handler(async ({ input }) => {
  return [...todos.values()]
})

export const postTodos = os.postTodos.handler(async ({ input }) => {
  const todo = { id: crypto.randomUUID(), title: input.title, done: false }
  todos.set(todo.id, todo)
  return todo
})

export const deleteTodosId = os.deleteTodosId.handler(async ({ input }) => {
  todos.delete(input.id)
})

export const patchTodosId = os.patchTodosId.handler(async ({ input }) => {
  const todo = { ...getTodo(input.id), done: input.done }
  todos.set(todo.id, todo)
  return todo
})
