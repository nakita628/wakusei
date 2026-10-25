import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import type { WakuseiConfig } from './layout.js'
import { makeRelativeSpecifier, makeSchemasSpecifier, resolveLayout } from './layout.js'

const base: WakuseiConfig = {
  input: 'openapi.yaml',
  mode: 'server',
  output: 'gen',
  schema: 'zod',
  readonly: false,
  exportSchemas: false,
  exportSchemasTypes: true,
  exportResponses: false,
  exportParameters: false,
  exportParametersTypes: false,
  exportHeaders: false,
  exportHeadersTypes: false,
  exportExamples: false,
  exportRequestBodies: false,
  exportSecuritySchemes: false,
  exportLinks: false,
  exportCallbacks: false,
  exportPathItems: false,
  exportMediaTypes: false,
  exportMediaTypesTypes: false,
}

const out = (file: string) => path.resolve('gen', file)

describe('resolveLayout', () => {
  it('aggregates into src/components/index.ts and writes handlers in server mode', () => {
    expect(resolveLayout(base)).toStrictEqual({
      base: path.resolve('gen'),
      pathAlias: undefined,
      schemas: { file: out('src/components/index.ts'), split: false, package: undefined },
      aggregate: true,
      components: [],
      handlersDir: out('src/handlers'),
      contract: undefined,
      packageRoots: new Map(),
    })
  })

  it('puts a flagged kind in its own file next to src/components/schemas.ts', () => {
    const layout = resolveLayout({ ...base, exportHeaders: true })
    expect([layout.aggregate, layout.schemas.file, layout.components]).toStrictEqual([
      false,
      out('src/components/schemas.ts'),
      [{ kind: 'headers', split: false, file: out('src/components/headers.ts') }],
    ])
  })

  it('keeps flagged kinds in components.output', () => {
    const layout = resolveLayout({
      ...base,
      exportLinks: true,
      components: { output: 'src/api.ts' },
    })
    expect([layout.aggregate, layout.schemas.file, layout.components]).toStrictEqual([
      true,
      out('src/api.ts'),
      [{ kind: 'links', split: false, file: out('src/api.ts') }],
    ])
  })

  it('reads a component directory as <dir>/index.ts, and a split schemas output as a directory', () => {
    const layout = resolveLayout({
      ...base,
      components: {
        schemas: { output: 'src/schemas', split: true, package: '@packages/schemas' },
        callbacks: { output: 'src/callbacks' },
      },
    })
    expect([layout.schemas, layout.components]).toStrictEqual([
      { file: out('src/schemas'), split: true, package: '@packages/schemas' },
      [{ kind: 'callbacks', split: false, file: out('src/callbacks/index.ts') }],
    ])
  })

  it('reads a split kind as a directory', () => {
    const layout = resolveLayout({
      ...base,
      components: { responses: { output: 'src/responses', split: true } },
    })
    expect([layout.aggregate, layout.components]).toStrictEqual([
      false,
      [{ kind: 'responses', split: true, file: out('src/responses') }],
    ])
  })

  it('reads each kind split independently of schemas.split', () => {
    const layout = resolveLayout({
      ...base,
      components: {
        schemas: { output: 'src/schemas', split: true },
        responses: { output: 'src/responses', split: true },
        callbacks: { output: 'src/callbacks' },
      },
    })
    expect([layout.schemas, layout.components]).toStrictEqual([
      { file: out('src/schemas'), split: true, package: undefined },
      [
        { kind: 'responses', split: true, file: out('src/responses') },
        { kind: 'callbacks', split: false, file: out('src/callbacks/index.ts') },
      ],
    ])
  })

  it('writes the contract, and handler stubs only with template, in contract mode', () => {
    expect(
      [
        resolveLayout({ ...base, mode: 'contract' }),
        resolveLayout({ ...base, mode: 'contract', template: {} }),
        resolveLayout({ ...base, mode: 'contract', template: { output: 'src/api' } }),
      ].map((layout) => [layout.contract, layout.handlersDir]),
    ).toStrictEqual([
      [out('src/contract.ts'), undefined],
      [out('src/contract.ts'), out('src/handlers')],
      [out('src/contract.ts'), out('src/api')],
    ])
  })
})

describe('makeSchemasSpecifier', () => {
  it('is relative by default, pointing at the index of a split directory', () => {
    const layout = resolveLayout({
      ...base,
      components: { schemas: { output: 'src/schemas', split: true } },
    })
    expect(makeSchemasSpecifier(layout, out('src/handlers'))).toBe('../schemas')
  })

  it('goes through pathAlias, which stands for <output>/src', () => {
    const layout = resolveLayout({ ...base, pathAlias: '@/' })
    expect(makeSchemasSpecifier(layout, out('src/handlers'))).toBe('@/components')
  })

  it('is relative for schemas outside <output>/src, even with pathAlias', () => {
    const layout = resolveLayout({
      ...base,
      pathAlias: '@/',
      components: { schemas: { output: 'schemas/index.ts' } },
    })
    expect(makeSchemasSpecifier(layout, out('src/handlers'))).toBe('../../schemas')
  })

  it('takes the package name from another package, and the path inside the same one', () => {
    const layout = {
      ...resolveLayout({
        ...base,
        pathAlias: '@/',
        components: {
          schemas: { output: 'src/schemas.ts', package: '@packages/schemas' },
          responses: { output: 'src/responses.ts' },
        },
      }),
      packageRoots: new Map([
        [out('src'), out('.')],
        [out('src/handlers'), path.resolve('app')],
      ]),
    }
    expect([
      makeSchemasSpecifier(layout, out('src/handlers')),
      makeSchemasSpecifier(layout, out('src')),
    ]).toStrictEqual(['@packages/schemas', '@/schemas'])
  })
})

describe('makeRelativeSpecifier', () => {
  it.each([
    ['/a/src/handlers', '/a/src/contract.ts', '../contract'],
    ['/a/src', '/a/src/components/index.ts', './components'],
    ['/a/src', '/a/src/index.ts', '.'],
  ])('from %s to %s is %s', (from, to, expected) => {
    expect(makeRelativeSpecifier(from, to)).toBe(expected)
  })
})
