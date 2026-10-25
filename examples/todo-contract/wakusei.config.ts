import { defineConfig } from 'wakusei'

export default defineConfig({
  input: 'openapi.yaml',
  mode: 'contract',
  output: '.',
  template: {},
  client: { baseUrl: { env: 'API_URL', source: 'process.env' } },
  format: { printWidth: 100, singleQuote: true, semi: false, experimentalSortImports: {} },
})
