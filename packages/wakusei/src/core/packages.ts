import path from 'node:path'

import { Data, Effect } from 'effect'

import { exists } from '../file/index.js'
import type { Layout } from './layout.js'
import { schemasDirectory, schemasImporters } from './layout.js'

/** A generated file would import the schemas from another package that names no `package`. */
export class PackageError extends Data.TaggedError('PackageError')<{
  readonly message: string
}> {}

/** The directories from `dir` up to the root, closest first. */
function ancestors(dir: string): readonly string[] {
  const parent = path.dirname(dir)
  return parent === dir ? [dir] : [dir, ...ancestors(parent)]
}

/**
 * The directory of the nearest `package.json` at or above `dir`, or `undefined` when there
 * is none. `dir` need not exist yet: a directory that is not there holds no `package.json`.
 */
function packageRootOf(dir: string) {
  return Effect.gen(function* () {
    const candidates = ancestors(dir)
    const found = yield* Effect.forEach(
      candidates,
      (candidate) => exists(path.join(candidate, 'package.json')),
      { concurrency: 'unbounded' },
    )
    return candidates.find((_, index) => found[index])
  })
}

/**
 * Fills `layout.packageRoots`: the package of the schemas and of every directory a file
 * that imports them is written into. A file imports the schemas relatively (or under
 * `pathAlias`) inside their package, and by `components.schemas.package` — or
 * `components.package` for a single components file — from another one.
 *
 * Fails when a file would import the schemas from another package that names no
 * `package`: the import could not be written.
 */
export function resolvePackageRoots(layout: Layout) {
  return Effect.gen(function* () {
    const directories = [...new Set([schemasDirectory(layout), ...schemasImporters(layout)])]
    const roots = yield* Effect.forEach(directories, packageRootOf, { concurrency: 'unbounded' })
    const packageRoots = new Map(directories.map((dir, index) => [dir, roots[index]]))
    const own = packageRoots.get(schemasDirectory(layout))
    const outside = schemasImporters(layout).find((dir) => packageRoots.get(dir) !== own)
    if (outside !== undefined && layout.schemas.package === undefined) {
      const field = layout.aggregate ? 'components.package' : 'components.schemas.package'
      return yield* new PackageError({
        message: `${outside} imports the schemas from another package: set ${field} to the name of the package ${layout.schemas.file} is written into.`,
      })
    }
    return { ...layout, packageRoots }
  })
}
