# Examples

Two versions of the same todo API, one per generation mode. Both start from the same `openapi.yaml`, keep the todos in memory and serve a Scalar API reference at `/docs`.

| Example                            | Mode       | Schema    | What it shows                                                          |
| ---------------------------------- | ---------- | --------- | ---------------------------------------------------------------------- |
| [`todo-server`](./todo-server)     | `server`   | `zod`     | `@orpc/server` procedures with the handler bodies written in place     |
| [`todo-contract`](./todo-contract) | `contract` | `valibot` | An `@orpc/contract` shared by `implement(contract)` and a typed client |

Each one runs from its own directory after a `pnpm install` at the repository root, with wakusei built (`vp run wakusei#build`):

```bash
cd examples/todo-server
pnpm generate   # regenerate src/ from openapi.yaml (handler bodies are kept)
pnpm dev        # http://localhost:3000, API reference at /docs
pnpm test       # the routes over oRPC's OpenAPIHandler, in process
pnpm typecheck
```
