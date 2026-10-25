import { client } from './client'

const todo = await client.postTodos({ title: 'Buy milk' })
await client.patchTodosId({ id: todo.id, done: true })
console.log(await client.getTodos())
await client.deleteTodosId({ id: todo.id })
