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
  exportSchemasTypes: false,
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

  it.each(['openapi.yaml', 'openapi.json', 'main.tsp'])('accepts %s as input', async (input) => {
    expect(await parse({ ...base, input })).toStrictEqual({ ...base, input, ...defaults })
  })

  it.each(['zod', 'valibot', 'arktype'])('accepts schema %s', async (schema) => {
    expect(await parse({ ...base, schema })).toStrictEqual({ ...base, ...defaults, schema })
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
        schemas: { output: 'src/schemas', split: true, import: '@/schemas' },
        responses: { output: 'src/components/responses.ts', import: '@/schemas' },
        parameters: { output: 'src/components/parameters.ts', import: '~/schemas' },
        callbacks: { output: 'src/components/callbacks.ts' },
        mediaTypes: { output: 'src/components/media.ts' },
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
        schemas: { output: 'src/schemas', split: true, import: '@/schemas' },
        responses: { output: 'src/components/responses.ts', import: '@/schemas' },
        parameters: { output: 'src/components/parameters.ts', import: '@/schemas' },
        headers: { output: 'src/components/headers.ts', import: '@/schemas' },
        examples: { output: 'src/components/examples.ts' },
        requestBodies: { output: 'src/components/request-bodies.ts', import: '@/schemas' },
        securitySchemes: { output: 'src/components/security-schemes.ts' },
        links: { output: 'src/components/links.ts' },
        callbacks: { output: 'src/components/callbacks.ts', import: '@/schemas' },
        pathItems: { output: 'src/components/path-items.ts', import: '@/schemas' },
        mediaTypes: { output: 'src/components/media-types.ts', import: '@/schemas' },
      },
    } as const
    expect(await parse(config)).toStrictEqual({ ...defaults, ...config })
  })

  it('accepts components.output alone', async () => {
    const config = { ...base, components: { output: 'src/components/index.ts' } }
    expect(await parse(config)).toStrictEqual({ ...config, ...defaults })
  })

  it.each(['../schemas', '.', '#schemas', '~/lib'])(
    'accepts import specifier %s',
    async (value) => {
      const config = {
        ...base,
        components: { schemas: { output: 'src/schemas.ts', import: value } },
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
      'a components import with whitespace',
      { ...base, components: { schemas: { output: 'src/schemas.ts', import: 'foo bar' } } },
      'components.schemas.import: must be a module specifier, with no whitespace or quotes',
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
      'an empty components import',
      { ...base, components: { schemas: { output: 'src/schemas.ts', import: '' } } },
      'components.schemas.import: must be a module specifier, with no whitespace or quotes',
    ],
    [
      'a components import with a quote',
      { ...base, components: { schemas: { output: 'src/schemas.ts', import: "foo'bar" } } },
      'components.schemas.import: must be a module specifier, with no whitespace or quotes',
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
