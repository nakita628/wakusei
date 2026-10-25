import { defineConfig } from 'wakusei'

export default defineConfig({
  input: 'openapi.yaml',
  mode: 'server',
  output: '.',
  format: { printWidth: 100, singleQuote: true, semi: false, experimentalSortImports: {} },
})
