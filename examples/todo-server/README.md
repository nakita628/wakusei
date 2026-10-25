# Todo API (server mode)

A todo API on [oRPC](https://orpc.dev/) whose procedures wakusei generates from `openapi.yaml` in **server mode**: every operation becomes an `@orpc/server` chain (`.route()`, `.input()`, `.output()`) with a `.handler()` stub, and the bodies are written straight into those stubs.

## Layout

| Path                | Written by | Contents                                            |
| ------------------- | ---------- | --------------------------------------------------- |
| `openapi.yaml`      | you        | The API                                             |
| `wakusei.config.ts` | you        | `mode: 'server'`, `schema: 'zod'`                   |
| `src/components/`   | wakusei    | Zod schemas and their types, rewritten on every run |
| `src/handlers/`     | both       | Generated chains around handler bodies you write    |
| `src/store.ts`      | you        | In-memory storage                                   |
| `src/errors.ts`     | you        | The `NOT_FOUND` error the handlers throw            |
| `src/router.ts`     | you        | The handlers as one router                          |
| `src/index.ts`      | you        | Node HTTP server with the API reference at `/docs`  |

## Run

```bash
pnpm generate   # regenerate src/components and src/handlers
pnpm dev        # http://localhost:3000 (PORT to change it)
pnpm test
pnpm typecheck
```

```bash
curl -X POST localhost:3000/todos -H 'content-type: application/json' -d '{"title":"Buy milk"}'
# {"id":1,"title":"Buy milk","status":"open","createdAt":"..."}

curl -X PATCH localhost:3000/todos/1 -H 'content-type: application/json' -d '{"status":"done"}'
curl 'localhost:3000/todos?status=done'
curl -X DELETE localhost:3000/todos/1

curl localhost:3000/todos/1
# {"defined":false,"code":"NOT_FOUND","status":404,"message":"No todo has id 1"}

curl -X POST localhost:3000/todos -H 'content-type: application/json' -d '{"title":""}'
# 400 BAD_REQUEST: the input schemas come from openapi.yaml
```

Open <http://localhost:3000/docs> for the API reference.

## Changing the API

Edit `openapi.yaml` and run `pnpm generate`. The handler bodies stay as written, a new operation arrives as an empty stub, and a removed one is deleted.

The generator owns the `@orpc/server` and `zod` imports of a handler file and every top-level statement other than the exported procedures. Keep helpers in their own modules (`src/store.ts`, `src/errors.ts`) and import them: those imports are kept, a helper declared inside `src/handlers` is not.
