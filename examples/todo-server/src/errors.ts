// Helpers live outside src/handlers: the generator owns the `@orpc/server` import and every
// top-level statement of a handler file except the exported procedures, so a helper declared
// there would be dropped on the next run. An import from this module is kept.
import { ORPCError } from '@orpc/server'

export const notFound = (id: number) =>
  new ORPCError('NOT_FOUND', { message: `No todo has id ${id}` })
