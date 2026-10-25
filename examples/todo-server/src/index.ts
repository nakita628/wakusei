import { createServer } from 'node:http'

import { OpenAPIHandler } from '@orpc/openapi/node'

import * as router from './handlers'

const handler = new OpenAPIHandler(router)

createServer(async (req, res) => {
  const { matched } = await handler.handle(req, res)
  if (!matched) res.writeHead(404).end()
}).listen(3000, () => console.log('http://localhost:3000'))
