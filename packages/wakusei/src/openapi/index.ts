import { Data, Effect } from 'effect'
import * as truth from 'oas-truth'

/** The document could not be read, compiled or parsed into an OpenAPI object. */
export class OpenAPIError extends Data.TaggedError('OpenAPIError')<{
  readonly message: string
}> {}

/**
 * Parses an OpenAPI (`.yaml` / `.json`) or TypeSpec (`.tsp`) document through oas-truth.
 * oas-truth never throws and answers with a result; this is where that result becomes
 * the error channel.
 */
export function parseOpenAPI(input: string) {
  return Effect.gen(function* () {
    const result = yield* Effect.promise(() => truth.parseOpenAPI(input))
    if (!result.ok) return yield* new OpenAPIError({ message: result.error })
    return result.value
  })
}
