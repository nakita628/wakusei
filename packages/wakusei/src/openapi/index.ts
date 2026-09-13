import { Data, Effect } from 'effect'
import * as truth from 'oas-truth'

/** The document could not be read, compiled or parsed into an OpenAPI object. */
export class OpenAPIError extends Data.TaggedError('OpenAPIError')<{
  readonly message: string
}> {}

/**
 * Parses an OpenAPI (`.yaml` / `.json`) or TypeSpec (`.tsp`) document through oas-truth.
 * oas-truth answers with a result; `tryPromise` is the belt for an unexpected throw,
 * and a failed result becomes `OpenAPIError`.
 */
export function parseOpenAPI(input: string) {
  return Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => truth.parseOpenAPI(input),
      catch: (error) =>
        new OpenAPIError({ message: error instanceof Error ? error.message : String(error) }),
    })
    if (!result.ok) return yield* new OpenAPIError({ message: result.error })
    return result.value
  })
}
