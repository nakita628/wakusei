# Todo API (contract mode)

The same todo API as [`todo-server`](../todo-server), generated in **contract mode**: wakusei writes one `@orpc/contract` router (`src/contract.ts`) with [Valibot](https://valibot.dev/) schemas, plus `implement(contract)` handler stubs (`template`). The contract is shared by the server and a type-safe client.

## Layout

| Path                | Written by | Contents                                                    |
| ------------------- | ---------- | ----------------------------------------------------------- |
| `openapi.yaml`      | you        | The API                                                     |
| `wakusei.config.ts` | you        | `mode: 'contract'`, `schema: 'valibot'`, `template: {}`     |
| `src/contract.ts`   | wakusei    | The contract router, rewritten on every run                 |
| `src/components/`   | wakusei    | Valibot schemas and their types                             |
| `src/handlers/`     | both       | `implement(contract)` stubs around handler bodies you write |
| `src/router.ts`     | you        | `implement(contract).router(handlers)`                      |
| `src/server.ts`     | you        | Node HTTP server with the API reference at `/docs`          |
| `src/client.ts`     | you        | A client typed by the contract (`OpenAPILink`)              |
| `src/demo.ts`       | you        | Walks through the API with that client                      |

## Run

```bash
pnpm generate   # regenerate src/contract.ts, src/components and src/handlers
pnpm dev        # http://localhost:3000 (PORT to change it)
pnpm client     # in another terminal: create, update, list and delete with the client
pnpm test       # the client against the router, in process
pnpm typecheck
```

`pnpm client` talks to `http://localhost:3000`; set `API_URL` to point it elsewhere.

```ts
import { createTodoClient } from './client'

const client = createTodoClient('http://localhost:3000')
const todo = await client.postTodos({ title: 'Buy milk' }) // typed as TodoSchema
await client.patchTodosId({ id: String(todo.id), status: 'done' })
```

The contract mirrors the wire: a path parameter is a string that the schema turns into a number, so the client passes `id` as a string and the handler receives a number.

## Changing the API

Edit `openapi.yaml` and run `pnpm generate`. `src/contract.ts` changes with it, so the client and the handlers stop compiling wherever they no longer match. The handler bodies are kept and a new operation arrives as a stub.
