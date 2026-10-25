import { createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

import { contract } from './contract'

export type Client = ContractRouterClient<typeof contract>

export const client: Client = createORPCClient(
  new OpenAPILink(contract, { url: process.env.API_URL! }),
)
