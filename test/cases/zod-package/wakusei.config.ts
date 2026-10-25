import { defineConfig } from 'wakusei'

// The schemas are written into a package of their own (the overlay's package.json delimits
// it), so the contract and the responses beside it import them by name.
export default defineConfig({
  input: '../../specs/blog.yaml',
  mode: 'contract',
  output: '../../__generated__/zod-package',
  schema: 'zod',
  pathAlias: '@/',
  exportResponses: true,
  components: {
    schemas: { output: 'packages/schemas/src', split: true, package: '@packages/schemas' },
    responses: { output: 'src/responses.ts' },
  },
})
