import { defineConfig } from 'wakusei'

export default defineConfig({
  input: 'openapi.yaml',
  // One @orpc/contract router in src/contract.ts, shared by the server and the client
  mode: 'contract',
  output: '.',
  schema: 'valibot',
  // implement(contract) stubs in src/handlers, merged on every run like server mode
  template: {},
  // The repository's fmt settings (vite.config.ts), so `vp check` passes on generated files
  format: { printWidth: 100, singleQuote: true, semi: false, experimentalSortImports: {} },
})
