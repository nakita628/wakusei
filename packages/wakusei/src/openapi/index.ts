import { Data, Effect } from 'effect'
import * as truth from 'oas-truth'

/** The document could not be read, compiled or parsed into an OpenAPI object. */
export class OpenAPIError extends Data.TaggedError('OpenAPIError')<{
  readonly message: string
}> {}

/**
 * Whether oas-truth's `parseOpenAPI` takes this input: a `.yaml`, `.yml`, `.json` or `.tsp`
 * path, or an http(s) URL. oas-truth 0.8 types its input this narrowly.
 */
function isOpenAPIInput(input: string): input is Parameters<typeof truth.parseOpenAPI>[0] {
  return (
    ['.yaml', '.yml', '.json', '.tsp'].some((extension) => input.endsWith(extension)) ||
    input.startsWith('http://') ||
    input.startsWith('https://')
  )
}

/**
 * Parses an OpenAPI (`.yaml` / `.json`) or TypeSpec (`.tsp`) document through oas-truth.
 * oas-truth answers with a result; `tryPromise` is the belt for an unexpected throw,
 * and a failed result becomes `OpenAPIError`.
 */
export function parseOpenAPI(input: string) {
  return Effect.gen(function* () {
    if (!isOpenAPIInput(input)) {
      return yield* new OpenAPIError({
        message: `Not an OpenAPI (.yaml / .yml / .json), TypeSpec (.tsp) or http(s) input: ${input}`,
      })
    }
    const result = yield* Effect.tryPromise({
      try: () => truth.parseOpenAPI(input),
      catch: (error) =>
        new OpenAPIError({ message: error instanceof Error ? error.message : String(error) }),
    })
    if (!result.ok) return yield* new OpenAPIError({ message: result.error })
    return result.value
  })
}
