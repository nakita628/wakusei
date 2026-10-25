import { defineConfig } from 'wakusei'

export default defineConfig({
  input: 'openapi.yaml',
  // @orpc/server procedures in src/handlers, schemas in src/components (`wakusei openapi.yaml`
  // does the same without a config, formatted with the oxfmt defaults)
  mode: 'server',
  output: '.',
  schema: 'zod',
  // The repository's fmt settings (vite.config.ts), so `vp check` passes on generated files
  format: { printWidth: 100, singleQuote: true, semi: false, experimentalSortImports: {} },
})
