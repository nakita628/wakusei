import { defineConfig } from 'wakusei'

export default defineConfig({
  input: '../../specs/blog.yaml',
  mode: 'contract',
  output: '../../__generated__/zod-template',
  schema: 'zod',
  template: {},
})
