import { defineConfig } from 'wakusei'

export default defineConfig({
  input: '../../specs/pets.tsp',
  mode: 'contract',
  output: '../../__generated__/typespec',
  schema: 'valibot',
})
