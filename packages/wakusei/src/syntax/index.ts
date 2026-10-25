import { parseSync, visitorKeys } from 'oxc-parser'
import type { Node, Program, Span } from 'oxc-parser'

/**
 * Parses a TypeScript module for reading. What a caller takes from the tree is a position,
 * a name or a kind; the text of a node is sliced from `code` by its position, so what is
 * written back is the source as it was, comments included.
 *
 * A module that does not parse comes back with an empty tree and the errors that stopped
 * it: the parser recovers nothing past a syntax error.
 */
export function parseSource(code: string): {
  readonly program: Program
  readonly errors: readonly string[]
} {
  const { program, errors } = parseSync('module.ts', code, {
    lang: 'ts',
    sourceType: 'module',
    // `(x)` is read as `x`: no caller asks about parentheses, and the tree is smaller.
    preserveParens: false,
  })
  return { program, errors: errors.map((error) => error.message) }
}

export function textOf(code: string, node: Span) {
  return code.slice(node.start, node.end)
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'type' in value && 'start' in value
}

/**
 * Calls `visit` on `node` and on every node under it, parents before children and each
 * child in the order the grammar lists them (a call's callee before its arguments), with
 * the chain of nodes above it, closest last. `ancestors` is reused as the walk goes on, so
 * a visitor that keeps it copies it.
 */
export function walk(
  node: Node,
  visit: (node: Node, ancestors: readonly Node[]) => void,
  ancestors: Node[] = [],
): void {
  visit(node, ancestors)
  const keys = visitorKeys[node.type]
  if (keys === undefined) return
  ancestors.push(node)
  for (const key of keys) {
    // Read by name rather than through `Object.entries`: a node has many more fields than
    // children.
    const child: unknown = Reflect.get(node, key)
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) walk(item, visit, ancestors)
      }
    } else if (isNode(child)) {
      walk(child, visit, ancestors)
    }
  }
  ancestors.pop()
}

/** The nodes under `node` that `is` picks out, in walk order, the node itself included. */
export function descendantsWhere<T extends Node>(
  node: Node,
  is: (candidate: Node) => candidate is T,
) {
  const found: T[] = []
  walk(node, (candidate) => {
    if (is(candidate)) found.push(candidate)
  })
  return found
}
