import { createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

import { contract } from './contract'

const client: ContractRouterClient<typeof contract> = createORPCClient(
  new OpenAPILink(contract, { url: 'http://localhost:3000' }),
)

const todo = await client.postTodos({ title: 'Buy milk' })
await client.patchTodosId({ id: todo.id, done: true })
console.log(await client.getTodos())
await client.deleteTodosId({ id: todo.id })
