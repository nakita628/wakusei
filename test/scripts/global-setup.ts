import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Regenerates every case before the runtime suite reads what the CLI wrote. */
export default function setup() {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const result = spawnSync(process.execPath, [path.join(dir, 'generate.mjs')], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error('wakusei code generation failed. Build the CLI first: vp run wakusei#build')
  }
}
