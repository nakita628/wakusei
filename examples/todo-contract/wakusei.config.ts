import { defineConfig } from 'wakusei'

export default defineConfig({
  input: 'openapi.yaml',
  mode: 'contract',
  output: '.',
  template: {},
  format: { printWidth: 100, singleQuote: true, semi: false, experimentalSortImports: {} },
})
