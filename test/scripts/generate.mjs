// Regenerates __generated__/<case> for every case by running the packaged wakusei CLI in the
// case's directory, the way a user runs it next to their wakusei.config.ts.
//
// A case with an `overlay/` gets it copied in first: handler files whose bodies a user
// already wrote. The CLI then regenerates around them, so the handler merge is exercised
// end to end and the result — generated chains, hand-written bodies — is what typecheck and
// the runtime suite check.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Invoke the CLI entry directly (node + file path) instead of the .bin shim: shims can be
// missing when a stale node_modules cache is restored in CI.
const cli = path.resolve(testRoot, '..', 'packages', 'wakusei', 'dist', 'cli.js')
if (!existsSync(cli)) {
  console.error(`missing ${cli} — build the CLI first: vp run wakusei#build`)
  process.exit(1)
}
const cases = readdirSync(path.join(testRoot, 'cases'))
  .filter((name) => existsSync(path.join(testRoot, 'cases', name, 'wakusei.config.ts')))
  .toSorted()

const generateCase = (name) =>
  new Promise((resolve) => {
    const out = path.join(testRoot, '__generated__', name)
    rmSync(out, { recursive: true, force: true })
    const overlay = path.join(testRoot, 'cases', name, 'overlay')
    if (existsSync(overlay)) cpSync(overlay, out, { recursive: true, dereference: true })
    const child = spawn(process.execPath, [cli], { cwd: path.join(testRoot, 'cases', name) })
    const chunks = []
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => chunks.push(chunk))
    child.on('error', (error) => {
      resolve({ name, ok: false, output: error.message })
    })
    child.on('close', (status) => {
      resolve({ name, ok: status === 0, output: Buffer.concat(chunks).toString() })
    })
  })

// Each CLI run is independent (own cwd, own output directory), so run them concurrently.
const queue = [...cases]
const results = []
const concurrency = Math.max(1, Math.min(4, os.availableParallelism() - 1))
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const name = queue.shift()
      if (name) {
        // oxlint-disable-next-line no-await-in-loop -- each worker drains the queue one case at a time to bound concurrency
        results.push(await generateCase(name))
      }
    }
  }),
)

const failed = results.filter((result) => !result.ok)
for (const result of failed) {
  console.error(`--- ${result.name} ---\n${result.output}`)
}
if (failed.length > 0) {
  console.error(`generate failed: ${failed.map((result) => result.name).join(', ')}`)
  process.exit(1)
}
console.log(`generated ${cases.length} cases: ${cases.join(', ')}`)
