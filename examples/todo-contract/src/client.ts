import { createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

import { contract } from './contract'

export type TodoClient = ContractRouterClient<typeof contract>

/**
 * A client typed by the generated contract. It speaks plain REST (`GET /todos`, `PATCH
 * /todos/{id}`, …), so the server behind `url` can be any implementation of openapi.yaml.
 */
export function createTodoClient(url: string, fetch: typeof globalThis.fetch = globalThis.fetch) {
  const link = new OpenAPILink(contract, { url, fetch })
  const client: TodoClient = createORPCClient(link)
  return client
}
