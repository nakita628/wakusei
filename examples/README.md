# Examples

The same todo API from one `openapi.yaml`, in each generation mode.

| Example         | Mode                  | You write                                                      |
| --------------- | --------------------- | -------------------------------------------------------------- |
| `todo-server`   | `server`              | The handler bodies in `src/handlers`, the store, the server    |
| `todo-contract` | `contract` + template | The same, plus `src/client.ts`, a client typed by the contract |

```bash
vp run wakusei#build   # once, at the repository root
cd examples/todo-server
pnpm generate          # openapi.yaml → src/components, src/handlers (your bodies are kept)
pnpm dev               # http://localhost:3000
```

```bash
curl -X POST localhost:3000/todos -H 'content-type: application/json' -d '{"title":"Buy milk"}'
curl -X PATCH localhost:3000/todos/<id> -H 'content-type: application/json' -d '{"done":true}'
curl localhost:3000/todos
curl -X DELETE localhost:3000/todos/<id>
```

In `todo-contract`, run `pnpm client` while `pnpm dev` is up.

Anything the handlers share goes in its own module (`src/db.ts`): the generator owns the `@orpc/*` and `zod` imports and every top-level statement in `src/handlers` other than the exported procedures.
