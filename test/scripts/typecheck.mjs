// Type-checks every case's generated code against the libraries it imports (@orpc/*, zod,
// valibot, arktype): `tsc -p cases/<name>` for each case that has a tsconfig.json.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Resolve tsc as a file and run it with node instead of the .bin shim: shims can be missing
// when a stale node_modules cache is restored in CI.
const tsc = path.join(
  path.dirname(
    createRequire(path.join(testRoot, 'package.json')).resolve('typescript/package.json'),
  ),
  'lib',
  'tsc.js',
)
const cases = readdirSync(path.join(testRoot, 'cases'))
  .filter((name) => existsSync(path.join(testRoot, 'cases', name, 'tsconfig.json')))
  .toSorted()

const typecheckCase = (name) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [tsc, '-p', path.join(testRoot, 'cases', name)])
    const chunks = []
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => chunks.push(chunk))
    child.on('error', (error) => {
      resolve({ name, ok: false, output: error.message })
    })
    child.on('close', (status) => {
      console.log(`typecheck: ${name} ${status === 0 ? 'ok' : 'FAILED'}`)
      resolve({ name, ok: status === 0, output: Buffer.concat(chunks).toString() })
    })
  })

// tsc processes are memory- and I/O-hungry; cap the parallelism so a 2-core CI runner stays
// sequential and a busy machine is not thrashed.
const queue = [...cases]
const results = []
const concurrency = Math.max(1, Math.min(2, Math.floor(os.availableParallelism() / 2)))
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const name = queue.shift()
      if (name) {
        // oxlint-disable-next-line no-await-in-loop -- each worker drains the queue one case at a time to bound concurrency
        results.push(await typecheckCase(name))
      }
    }
  }),
)

const failed = results.filter((result) => !result.ok)
for (const result of failed) {
  console.error(`--- ${result.name} ---\n${result.output}`)
}
if (failed.length > 0) {
  console.error(`typecheck failed: ${failed.map((result) => result.name).join(', ')}`)
  process.exit(1)
}
console.log(`typecheck passed for ${cases.length} cases`)
