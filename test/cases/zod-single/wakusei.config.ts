import { defineConfig } from 'wakusei'

export default defineConfig({
  input: '../../specs/blog.yaml',
  mode: 'contract',
  output: '../../__generated__/zod-single/api.ts',
  schema: 'zod',
})
