import { defineConfig } from 'wakusei'

export default defineConfig({
  input: '../../specs/blog.yaml',
  mode: 'server',
  output: '../../__generated__/zod-server',
  schema: 'zod',
})
