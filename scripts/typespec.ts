// Checks that the TypeSpec packages in pnpm-lock.yaml come from one TypeSpec release.
//
// TypeSpec publishes every @typespec/* package together (compiler, http, openapi and openapi3 on
// 1.x, rest and versioning on 0.x) and each declares the others as peers at its own release
// (@typespec/openapi3 1.16.0 wants @typespec/compiler ^1.16.0 and @typespec/versioning ^0.86.0).
// The catalog in pnpm-workspace.yaml keeps this repository's own ranges in step, but a half-bumped
// set still installs with only a warning: a dependency (oas-truth) can pull in another
// release, and Renovate's security updates bypass the "typespec" group in renovate.json and bump
// only the advisory's package. This check is what makes such a change fail.

import { readFileSync } from 'node:fs'
import process from 'node:process'

import semver from 'semver'
import { parse } from 'yaml'

const SCOPE = '@typespec/'

type LockedPackage = { readonly peerDependencies?: Readonly<Record<string, string>> }

const lockfile: { readonly packages?: Readonly<Record<string, LockedPackage>> } = parse(
  readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'),
)

// `packages` has one key per resolved version — `@typespec/http@1.16.0` — whatever the peers it
// was installed with (those are `snapshots`), so two keys for one name are two versions.
const resolved = new Map<
  string,
  { readonly version: string; readonly peers: Readonly<Record<string, string>> }[]
>()
for (const [spec, metadata] of Object.entries(lockfile.packages ?? {})) {
  const at = spec.lastIndexOf('@')
  const name = spec.slice(0, at)
  if (name.startsWith(SCOPE)) {
    const copies = resolved.get(name) ?? []
    copies.push({ version: spec.slice(at + 1), peers: metadata.peerDependencies ?? {} })
    resolved.set(name, copies)
  }
}

const problems: string[] = []

for (const [name, copies] of resolved) {
  if (copies.length > 1) {
    problems.push(
      `${name} resolves to ${copies.length} versions: ${copies.map((copy) => copy.version).join(', ')}`,
    )
  }
}

// The 1.x packages carry the release's own version. The 0.x ones (rest, versioning, and
// asset-emitter, which is versioned on its own) are tied to it through the peer ranges below.
const stable = [...resolved].filter(([, copies]) =>
  copies.some((copy) => !copy.version.startsWith('0.')),
)
if (new Set(stable.flatMap(([, copies]) => copies.map((copy) => copy.version))).size > 1) {
  problems.push(
    `the 1.x packages resolve to more than one version: ${stable
      .map(([name, copies]) => `${name}@${copies.map((copy) => copy.version).join(',')}`)
      .join(' ')}`,
  )
}

for (const [name, copies] of resolved) {
  for (const copy of copies) {
    for (const [peer, range] of Object.entries(copy.peers)) {
      for (const installed of resolved.get(peer) ?? []) {
        if (!semver.satisfies(installed.version, range)) {
          problems.push(
            `${name}@${copy.version} wants ${peer}@${range}, pnpm-lock.yaml has ${installed.version}`,
          )
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error('typespec: the @typespec/* packages in pnpm-lock.yaml are not one TypeSpec release')
  for (const problem of problems) {
    console.error(`  ${problem}`)
  }
  console.error(
    '\nMove every @typespec/* entry in the catalog of pnpm-workspace.yaml to the same release,' +
      '\nthen re-resolve the ones pnpm keeps at their old version:' +
      `\n  pnpm install && pnpm update -r ${[...resolved.keys()].toSorted().join(' ')}`,
  )
  process.exit(1)
}
