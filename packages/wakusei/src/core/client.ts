import path from 'node:path'

import { Data, Effect } from 'effect'

import { emit } from '../emit/index.js'
import type { BaseUrl, ClientConfig } from './layout.js'
import { makeLocalSpecifier } from './layout.js'
import { packageRootOf } from './packages.js'

/** The client is written into another package than the contract, and `client.import` is unset. */
export class ClientImportError extends Data.TaggedError('ClientImportError')<{
  readonly message: string
}> {}

/**
 * The `url` of the link. The origin of the page is read on every request, so that importing
 * the client where there is no `location` (a server render, a test) does not fail. A
 * variable is asserted present: the deployment sets it, and a fallback would only hide
 * its absence. A property of an environment object is the module's to answer for.
 */
function makeUrl(baseUrl: BaseUrl) {
  if (typeof baseUrl === 'string') {
    return { imports: [], url: '()=>globalThis.location.origin' } as const
  }
  if ('import' in baseUrl) {
    return {
      imports: [`import{${baseUrl.name}}from'${baseUrl.import}'`],
      url: `${baseUrl.name}.${baseUrl.env}`,
    } as const
  }
  return { imports: [], url: `${baseUrl.source}.${baseUrl.env}!` } as const
}

/** The client module: one `OpenAPILink` over the contract, and the client typed by it. */
export function makeClient(client: ClientConfig, contractSpecifier: string) {
  const { imports, url } = makeUrl(client.baseUrl)
  const fetch =
    client.credentials === undefined
      ? ''
      : `,fetch:(request,init)=>globalThis.fetch(request,{...init,credentials:'${client.credentials}'})`
  return [
    [
      "import{createORPCClient}from'@orpc/client'",
      "import type{ContractRouterClient}from'@orpc/contract'",
      "import{OpenAPILink}from'@orpc/openapi-client/fetch'",
      `import{contract}from'${contractSpecifier}'`,
      ...imports,
    ].join('\n'),
    'export type Client=ContractRouterClient<typeof contract>',
    `export const client:Client=createORPCClient(new OpenAPILink(contract,{url:${url}${fetch}}))`,
  ].join('\n\n')
}

/**
 * Writes the client of the contract in `contractFile` to `client.output`, resolved against
 * `base`. The contract is imported by `client.import`, or else relatively (under
 * `pathAlias` inside `<base>/src`), which only works inside the package of the contract.
 */
export function writeClient(
  client: ClientConfig,
  contractFile: string,
  base: string,
  pathAlias: string | undefined,
) {
  return Effect.gen(function* () {
    const file = path.resolve(base, client.output ?? 'src/client.ts')
    const dir = path.dirname(file)
    if (client.import === undefined) {
      const [own, contract] = yield* Effect.all(
        [packageRootOf(dir), packageRootOf(path.dirname(contractFile))],
        { concurrency: 'unbounded' },
      )
      if (own !== contract) {
        return yield* new ClientImportError({
          message: `${file} imports the contract from another package: set client.import to the name of the package ${contractFile} is written into.`,
        })
      }
    }
    const specifier = client.import ?? makeLocalSpecifier(base, pathAlias, dir, contractFile)
    return yield* emit(makeClient(client, specifier), dir, file)
  })
}
