// In-memory todo storage shared by every handler. A real app would put a database here; the
// handlers only call these functions, so swapping it out leaves them unchanged.
import type { TodoSchema, TodoStatusSchema } from './components'

const todos = new Map<number, TodoSchema>()
let nextId = 1

export function listTodos(status?: TodoStatusSchema) {
  const all = [...todos.values()]
  return status === undefined ? all : all.filter((todo) => todo.status === status)
}

export function createTodo(title: string) {
  const todo: TodoSchema = {
    id: nextId++,
    title,
    status: 'open',
    createdAt: new Date().toISOString(),
  }
  todos.set(todo.id, todo)
  return todo
}

export function findTodo(id: number) {
  return todos.get(id)
}

export function updateTodo(
  id: number,
  patch: { readonly title?: string | undefined; readonly status?: TodoStatusSchema | undefined },
) {
  const todo = todos.get(id)
  if (todo === undefined) return undefined
  // A field left out (or sent as undefined) keeps its current value.
  const updated: TodoSchema = {
    ...todo,
    title: patch.title ?? todo.title,
    status: patch.status ?? todo.status,
  }
  todos.set(id, updated)
  return updated
}

export function deleteTodo(id: number) {
  return todos.delete(id)
}

/** Empties the store and restarts the ids at 1 (used between tests). */
export function resetTodos() {
  todos.clear()
  nextId = 1
}
