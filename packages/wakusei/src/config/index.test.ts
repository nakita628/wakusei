import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { ConfigError, defineConfig, parseConfig, readConfig } from './index.js'

const base = { input: 'openapi.yaml', mode: 'server', output: './out' } as const

/** What every config decodes to when it leaves the flags and the library unset. */
const defaults = {
  readonly: false,
  schema: 'zod',
  exportSchemas: false,
  exportSchemasTypes: true,
  exportResponses: false,
  exportParameters: false,
  exportParametersTypes: false,
  exportExamples: false,
  exportRequestBodies: false,
  exportHeaders: false,
  exportHeadersTypes: false,
  exportSecuritySchemes: false,
  exportLinks: false,
  exportCallbacks: false,
  exportPathItems: false,
  exportMediaTypes: false,
  exportMediaTypesTypes: false,
} as const

function parse(config: unknown) {
  return Effect.runPromise(parseConfig(config))
}

async function parseError(config: unknown) {
  const error = await Effect.runPromise(Effect.flip(parseConfig(config)))
  return error.message
}

describe('parseConfig', () => {
  it('fills in the flags and the library of a minimal server config', async () => {
    expect(await parse(base)).toStrictEqual({ ...base, ...defaults })
  })

  it('accepts a contract config with a template directory', async () => {
    const config = { ...base, mode: 'contract', template: { output: 'src/controllers' } }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
  })

  it('accepts an empty template', async () => {
    const config = { ...base, mode: 'contract', template: {} }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
  })

  it('fills in the base URL of a client', async () => {
    const config = { ...base, mode: 'contract', client: {} }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults, client: { baseUrl: '/' } })
  })

  it.each([
    { env: 'VITE_API_URL' },
    { env: 'API_URL', source: 'process.env' },
    { env: 'API_URL', import: '@/env' },
    { env: 'API_URL', import: '../env', name: 'config' },
  ])('accepts the client base URL %o as written', async (baseUrl) => {
    const config = { ...base, mode: 'contract', client: { baseUrl, credentials: 'include' } }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
  })

  it.each(['openapi.yaml', 'openapi.json', 'main.tsp'])('accepts %s as input', async (input) => {
    expect(await parse({ ...base, input })).toStrictEqual({ ...base, input, ...defaults })
  })

  it.each(['zod', 'valibot', 'arktype'])('accepts schema %s', async (schema) => {
    expect(await parse({ ...base, schema })).toStrictEqual({ ...base, ...defaults, schema })
  })

  it('accepts exportSchemasTypes false', async () => {
    expect(await parse({ ...base, exportSchemasTypes: false })).toStrictEqual({
      ...base,
      ...defaults,
      exportSchemasTypes: false,
    })
  })

  it('accepts every field', async () => {
    const config = {
      ...base,
      format: { printWidth: 80 },
      readonly: true,
      pathAlias: '@/',
      prefix: '/api/v1',
      exportSchemas: true,
      exportSchemasTypes: true,
      exportResponses: true,
      exportParametersTypes: true,
      exportMediaTypes: true,
      components: {
        schemas: {
          output: 'packages/schemas',
          split: true,
          package: '@packages/schemas',
          exportTypes: true,
        },
        responses: { output: 'src/components/responses.ts', split: false },
        parameters: { output: 'src/components/parameters.ts', split: false, exportTypes: true },
        callbacks: { output: 'src/components/callbacks.ts', split: false },
        mediaTypes: { output: 'src/components/media.ts', split: false, exportTypes: false },
      },
    }
    expect(await parse(config)).toStrictEqual({ ...defaults, ...config })
  })

  it('accepts the Full Config Reference shape', async () => {
    const config = {
      input: 'openapi.yaml',
      output: '.',
      mode: 'contract',
      schema: 'zod',
      format: {},
      template: { output: 'src/handlers' },
      readonly: false,
      prefix: '/api/v1',
      pathAlias: '@/',
      exportSchemas: true,
      exportSchemasTypes: true,
      exportResponses: true,
      exportParameters: true,
      exportParametersTypes: true,
      exportExamples: true,
      exportRequestBodies: true,
      exportHeaders: true,
      exportHeadersTypes: true,
      exportSecuritySchemes: true,
      exportLinks: true,
      exportCallbacks: true,
      exportPathItems: true,
      exportMediaTypes: true,
      exportMediaTypesTypes: true,
      components: {
        schemas: {
          output: 'packages/schemas/src',
          exportTypes: true,
          split: true,
          package: '@packages/schemas',
        },
        responses: { output: 'src/responses', split: true },
        parameters: { output: 'src/parameters', exportTypes: true, split: true },
        headers: { output: 'src/headers', exportTypes: true, split: true },
        examples: { output: 'src/examples', split: true },
        requestBodies: { output: 'src/requestBodies', split: true },
        securitySchemes: { output: 'src/securitySchemes', split: true },
        links: { output: 'src/links', split: true },
        callbacks: { output: 'src/callbacks', split: true },
        pathItems: { output: 'src/pathItems', split: true },
        mediaTypes: { output: 'src/mediaTypes', exportTypes: true, split: true },
      },
    } as const
    expect(await parse(config)).toStrictEqual({ ...defaults, ...config })
  })

  it('fills split and exportTypes on a per-type component', async () => {
    expect(
      await parse({ ...base, components: { schemas: { output: 'src/schemas.ts' } } }),
    ).toStrictEqual({
      ...base,
      ...defaults,
      components: { schemas: { output: 'src/schemas.ts', split: false, exportTypes: false } },
    })
  })

  it('accepts components.output alone', async () => {
    const config = { ...base, components: { output: 'src/components/index.ts' } }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
  })

  it('accepts components.package next to components.output', async () => {
    const config = {
      ...base,
      components: { output: 'packages/api/index.ts', package: '@packages/api' },
    }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
  })

  it.each(['@packages/schemas', 'schemas', '#schemas'])(
    'accepts package name %s',
    async (value) => {
      const config = {
        ...base,
        components: {
          schemas: { output: 'src/schemas.ts', package: value, split: false, exportTypes: false },
        },
      }
      expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
    },
  )

  it.each(['@/', '~/', '#'])('accepts pathAlias %s', async (pathAlias) => {
    expect(await parse({ ...base, pathAlias })).toStrictEqual({ ...base, pathAlias, ...defaults })
  })

  it.each(['/api/v1', '/v1', '/'])('accepts prefix %s', async (prefix) => {
    expect(await parse({ ...base, prefix })).toStrictEqual({ ...base, prefix, ...defaults })
  })

  it.each([
    ['a missing mode', { input: 'openapi.yaml', output: '.' }, 'mode: Missing key'],
    ['an unknown mode', { ...base, mode: 'invalid' }, 'mode: Expected "server" | "contract"'],
    ['a missing input', { mode: 'server', output: '.' }, 'input: Missing key'],
    ['a missing output', { input: 'openapi.yaml', mode: 'server' }, 'output: Missing key'],
    [
      'an empty output',
      { ...base, output: '' },
      'output: Expected a value with a length of at least 1',
    ],
    [
      'an input that is not .yaml/.json/.tsp',
      { ...base, input: 'openapi.txt' },
      'input: must be .yaml | .json | .tsp',
    ],
    [
      'an unknown schema library',
      { ...base, schema: 'yup' },
      'schema: Expected "zod" | "valibot" | "arktype"',
    ],
    ['template in server mode', { ...base, template: {} }, 'template: Expected no excess property'],
    ['client in server mode', { ...base, client: {} }, 'client: Expected no excess property'],
    [
      'a client written to a directory',
      { ...base, mode: 'contract', client: { output: 'src/client' } },
      'client.output: must be .ts file',
    ],
    [
      'a fixed client base URL',
      { ...base, mode: 'contract', client: { baseUrl: 'http://localhost:3000' } },
      "client.baseUrl: a fixed URL is not taken: leave baseUrl out (or set '/') for the same origin, or read it from the environment with { env } or { env, import }",
    ],
    [
      'a client base URL variable that is not a name',
      { ...base, mode: 'contract', client: { baseUrl: { env: 'API-URL' } } },
      'client.baseUrl.env: must be the name of an environment variable',
    ],
    [
      'an environment object named like a binding of the client file',
      {
        ...base,
        mode: 'contract',
        client: { baseUrl: { env: 'API_URL', import: '@/env', name: 'contract' } },
      },
      'client.baseUrl.name: must not be a name the client file binds itself (client, Client, contract, createORPCClient, ContractRouterClient, OpenAPILink)',
    ],
    [
      'an unknown client base URL source',
      { ...base, mode: 'contract', client: { baseUrl: { env: 'API_URL', source: 'window' } } },
      'client.baseUrl.source: Expected "import.meta.env" | "process.env"',
    ],
    [
      'a client base URL with both import and source',
      {
        ...base,
        mode: 'contract',
        client: { baseUrl: { env: 'API_URL', import: '@/env', source: 'process.env' } },
      },
      'client.baseUrl: source goes with { env } alone: with import, the property is read from the environment object the module exports',
    ],
    [
      'a client base URL name without import',
      { ...base, mode: 'contract', client: { baseUrl: { env: 'API_URL', name: 'env' } } },
      'client.baseUrl: name goes with { env, import }: it is the export of import to read env from',
    ],
    [
      'an unknown client credentials mode',
      { ...base, mode: 'contract', client: { credentials: 'always' } },
      'client.credentials: Expected "include" | "same-origin" | "omit"',
    ],
    [
      'a quote in client.import',
      { ...base, mode: 'contract', client: { import: "@x'" } },
      'client.import: must be a module specifier, with no whitespace or quotes',
    ],
    [
      'split: true with a .ts file',
      { ...base, components: { responses: { output: 'src/x.ts', split: true } } },
      'components.responses.output: split mode requires directory, not .ts file',
    ],
    [
      'exportTypes on responses',
      { ...base, components: { responses: { output: 'src/r.ts', exportTypes: true } } },
      'components.responses.exportTypes: Expected no excess property',
    ],
    [
      'a .ts template.output',
      { ...base, mode: 'contract', template: { output: 'src/x.ts' } },
      'template.output: must be a directory, not a .ts file',
    ],
    [
      'components.output next to a per-type output',
      {
        ...base,
        components: { output: 'src/components/index.ts', responses: { output: 'src/responses' } },
      },
      'components: components.output is mutually exclusive with per-type component outputs (schemas, responses, parameters, ...). Use output for single-file mode, or per-type fields for split mode.',
    ],
    [
      'components.output next to components.schemas',
      {
        ...base,
        components: { output: 'src/components/index.ts', schemas: { output: 'src/schemas' } },
      },
      'components: components.output is mutually exclusive with per-type component outputs (schemas, responses, parameters, ...). Use output for single-file mode, or per-type fields for split mode.',
    ],
    [
      'a components.output that is not a .ts file',
      { ...base, components: { output: 'src/components' } },
      'components.output: must be .ts file',
    ],
    [
      'an empty components.schemas.output',
      { ...base, components: { schemas: { output: '' } } },
      'components.schemas.output: Expected a value with a length of at least 1',
    ],
    [
      'a top-level schemas (it lives under components.schemas)',
      { ...base, schemas: { output: 'src/schemas', split: true } },
      'schemas: Expected no excess property',
    ],
    ['an unknown key', { ...base, orpc: { mode: 'server' } }, 'orpc: Expected no excess property'],
    [
      'a format that is not an object',
      { ...base, format: 'pretty' },
      'format: must be an oxfmt FormatConfig object',
    ],
    [
      'a pathAlias with whitespace',
      { ...base, pathAlias: '@ /' },
      'pathAlias: must be an import prefix, with no whitespace or quotes',
    ],
    [
      'a pathAlias with a quote',
      { ...base, pathAlias: "foo'bar" },
      'pathAlias: must be an import prefix, with no whitespace or quotes',
    ],
    [
      'a package name with whitespace',
      { ...base, components: { schemas: { output: 'src/schemas.ts', package: 'foo bar' } } },
      'components.schemas.package: must be a module specifier, with no whitespace or quotes',
    ],
    [
      'components.schemas.import, which was removed',
      { ...base, components: { schemas: { output: 'src/schemas.ts', import: '@/schemas' } } },
      'components.schemas.import: import was removed: a generated file imports the schemas relatively, under pathAlias inside `<output>/src`, or by `package` from another package.',
    ],
    [
      'components.responses.import, which was removed',
      { ...base, components: { responses: { output: 'src/r.ts', import: '@/schemas' } } },
      'components.responses.import: import was removed: a generated file imports the schemas relatively, under pathAlias inside `<output>/src`, or by `package` from another package.',
    ],
    [
      'package on a kind other files never import',
      { ...base, components: { responses: { output: 'src/r.ts', package: '@p/r' } } },
      'components.responses.package: Expected no excess property',
    ],
    [
      'components.package without components.output',
      {
        ...base,
        components: { package: '@p/c', schemas: { output: 'src/schemas.ts' } },
      },
      'components: components.package goes with components.output; with per-type outputs, set components.schemas.package.',
    ],
    [
      'a prefix with a quote',
      { ...base, prefix: "/api/'v1" },
      'prefix: must be a path prefix, with no whitespace or quotes',
    ],
    [
      'a prefix with whitespace',
      { ...base, prefix: '/api /v1' },
      'prefix: must be a path prefix, with no whitespace or quotes',
    ],
    [
      'an empty pathAlias',
      { ...base, pathAlias: '' },
      'pathAlias: must be an import prefix, with no whitespace or quotes',
    ],
    [
      'an empty prefix',
      { ...base, prefix: '' },
      'prefix: must be a path prefix, with no whitespace or quotes',
    ],
    [
      'an empty package name',
      { ...base, components: { schemas: { output: 'src/schemas.ts', package: '' } } },
      'components.schemas.package: must be a module specifier, with no whitespace or quotes',
    ],
    [
      'a package name with a quote',
      { ...base, components: { schemas: { output: 'src/schemas.ts', package: "foo'bar" } } },
      'components.schemas.package: must be a module specifier, with no whitespace or quotes',
    ],
    [
      'a pathAlias with a backslash',
      { ...base, pathAlias: 'foo\\bar' },
      'pathAlias: must be an import prefix, with no whitespace or quotes',
    ],
    [
      'a pathAlias with a backtick',
      { ...base, pathAlias: 'foo`bar' },
      'pathAlias: must be an import prefix, with no whitespace or quotes',
    ],
    [
      'a pathAlias with a newline',
      { ...base, pathAlias: 'foo\nbar' },
      'pathAlias: must be an import prefix, with no whitespace or quotes',
    ],
  ])('rejects %s', async (_, config, message) => {
    expect(await parseError(config)).toBe(`Invalid config: ${message}`)
  })
})

describe('defineConfig', () => {
  it('returns the config as written', () => {
    const config = { input: 'openapi.yaml', mode: 'contract', output: '.', template: {} } as const
    expect(defineConfig(config)).toBe(config)
  })
})

/** The error `readConfig` fails with. */
function read(configPath?: string) {
  return Effect.runPromise(
    Effect.flip(readConfig(configPath)).pipe(Effect.provide(NodeServices.layer)),
  )
}

describe('readConfig', () => {
  const originalCwd = process.cwd()
  const dirs: string[] = []

  function useTmpDir(files: { readonly [name: string]: string }) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wakusei-config-')))
    dirs.push(dir)
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content)
    }
    process.chdir(dir)
    return dir
  }

  afterEach(() => {
    process.chdir(originalCwd)
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('loads and validates ./wakusei.config.ts', async () => {
    useTmpDir({
      'wakusei.config.ts':
        "export default { input: 'openapi.yaml', mode: 'contract', output: 'gen', schema: 'valibot' }\n",
    })
    const config = await Effect.runPromise(readConfig().pipe(Effect.provide(NodeServices.layer)))
    expect(config).toStrictEqual({
      ...defaults,
      input: 'openapi.yaml',
      mode: 'contract',
      output: 'gen',
      schema: 'valibot',
    })
  })

  it('marks a missing config as not found', async () => {
    const dir = useTmpDir({})
    expect(await read()).toStrictEqual(
      new ConfigError({
        message: `Config not found: ${path.join(dir, 'wakusei.config.ts')}\nCreate wakusei.config.ts in the current directory, or pass <input>. See https://github.com/nakita628/wakusei#full-config-reference for an example.`,
        notFound: true,
      }),
    )
  })

  it('rejects a config without a default export', async () => {
    const dir = useTmpDir({ 'api.config.ts': 'export const config = {}\n' })
    expect(await read('api.config.ts')).toStrictEqual(
      new ConfigError({
        message: `Config must export default object from ${path.join(dir, 'api.config.ts')}\nDid you forget \`export default defineConfig({ ... })\`?`,
      }),
    )
  })

  it('reports a config that does not validate', async () => {
    useTmpDir({ 'wakusei.config.ts': "export default { input: 'openapi.yaml', mode: 'server' }\n" })
    expect(await read()).toStrictEqual(
      new ConfigError({ message: 'Invalid config: output: Missing key' }),
    )
  })
})
