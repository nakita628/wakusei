import { implement } from '@orpc/server'

import { contract } from '../contract'
import { notFound } from '../errors'
import { createTodo, deleteTodo, findTodo, listTodos, updateTodo } from '../store'

const os = implement(contract)

export const getTodos = os.getTodos.handler(async ({ input }) => {
  return listTodos(input.status)
})

export const postTodos = os.postTodos.handler(async ({ input }) => {
  return createTodo(input.title)
})

export const getTodosId = os.getTodosId.handler(async ({ input }) => {
  const todo = findTodo(input.id)
  if (todo === undefined) throw notFound(input.id)
  return todo
})

export const deleteTodosId = os.deleteTodosId.handler(async ({ input }) => {
  if (!deleteTodo(input.id)) throw notFound(input.id)
})

export const patchTodosId = os.patchTodosId.handler(async ({ input }) => {
  const { id, ...patch } = input
  const todo = updateTodo(id, patch)
  if (todo === undefined) throw notFound(id)
  return todo
})
