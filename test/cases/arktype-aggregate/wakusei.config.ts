import { defineConfig } from 'wakusei'

export default defineConfig({
  input: '../../specs/blog.yaml',
  mode: 'contract',
  output: '../../__generated__/arktype-aggregate',
  schema: 'arktype',
  exportSchemas: true,
  exportSchemasTypes: true,
  exportResponses: true,
  exportParameters: true,
  exportParametersTypes: true,
  exportHeaders: true,
  exportHeadersTypes: true,
  exportExamples: true,
  exportRequestBodies: true,
  exportSecuritySchemes: true,
  exportLinks: true,
  exportCallbacks: true,
  exportPathItems: true,
  exportMediaTypes: true,
  exportMediaTypesTypes: true,
  components: { output: 'src/api.ts' },
})
