// Serves the contract over HTTP: the REST routes from openapi.yaml under `/`, and an
// interactive API reference (Scalar) at `/docs` built from the same contract.
import { createServer } from 'node:http'

import { OpenAPIHandler } from '@orpc/openapi/node'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { onError, ORPCError } from '@orpc/server'
import { experimental_ValibotToJsonSchemaConverter as ValibotToJsonSchemaConverter } from '@orpc/valibot'

import { router } from './router'

const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferencePlugin({
      docsPath: '/docs',
      specPath: '/spec.json',
      schemaConverters: [new ValibotToJsonSchemaConverter()],
      specGenerateOptions: { info: { title: 'Todo API (contract mode)', version: '1.0.0' } },
    }),
  ],
  // 4xx answers (validation, NOT_FOUND) are expected; log only what the server failed at.
  interceptors: [
    onError((error) => {
      if (!(error instanceof ORPCError) || error.status >= 500) console.error(error)
    }),
  ],
})

const port = Number(process.env.PORT ?? 3000)

createServer(async (req, res) => {
  const { matched } = await handler.handle(req, res)
  if (!matched) {
    res.statusCode = 404
    res.end('Not found')
  }
}).listen(port, () => {
  console.log(`Todo API on http://localhost:${port} (docs: http://localhost:${port}/docs)`)
})
