// Walks through the API with the typed client. Start the server first (`pnpm dev`), then run
// `pnpm client` in another terminal.
import { createTodoClient } from './client'

const client = createTodoClient(process.env.API_URL ?? 'http://localhost:3000')

const milk = await client.postTodos({ title: 'Buy milk' })
const docs = await client.postTodos({ title: 'Read the oRPC docs' })
console.log('created', milk, docs)

// Path parameters travel as strings on the wire; the contract converts them back to numbers.
await client.patchTodosId({ id: String(milk.id), status: 'done' })

console.log('open', await client.getTodos({ status: 'open' }))
console.log('done', await client.getTodos({ status: 'done' }))

await client.deleteTodosId({ id: String(milk.id) })
console.log('after delete', await client.getTodos({}))
