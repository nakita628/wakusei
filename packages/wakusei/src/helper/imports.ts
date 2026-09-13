import { collectFreeIdentifiers } from './identifiers.js'

export type ImportEntry = {
  readonly name: string
  readonly from: string
  readonly style?: 'namespace' | 'type'
}

function renderImport(from: string, entries: readonly ImportEntry[]) {
  const namespace = entries.find((entry) => entry.style === 'namespace')
  if (namespace) return `import*as ${namespace.name} from'${from}'`
  if (entries.every((entry) => entry.style === 'type')) {
    return `import type{${entries.map((entry) => entry.name).join(',')}}from'${from}'`
  }
  const names = entries.map((entry) => (entry.style === 'type' ? `type ${entry.name}` : entry.name))
  return `import{${names.join(',')}}from'${from}'`
}

/**
 * Import lines for the candidates the code actually references, grouped per
 * module in candidate order. The first candidate for a name wins.
 */
export function makeImports(code: string, candidates: readonly ImportEntry[]) {
  const used = collectFreeIdentifiers(code)
  const referenced = candidates.filter((entry) => used.has(entry.name))
  const modules = referenced
    .filter((entry, index) => referenced.findIndex((e) => e.name === entry.name) === index)
    .reduce(
      (acc, entry) => acc.set(entry.from, [...(acc.get(entry.from) ?? []), entry]),
      new Map<string, readonly ImportEntry[]>(),
    )
  return [...modules].map(([from, entries]) => renderImport(from, entries))
}

/** Prepends the import block (if any) to a generated module body. */
export function withImports(body: string, candidates: readonly ImportEntry[]) {
  const imports = makeImports(body, candidates)
  return imports.length > 0 ? `${imports.join('\n')}\n\n${body}` : body
}
