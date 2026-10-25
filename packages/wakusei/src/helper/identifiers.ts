import type { Node, Statement } from 'oxc-parser'

import { parseSource, walk } from '../syntax/index.js'

/**
 * A declaration's own name, an object key or a member name is not a reference. Identifier
 * handling on generated source goes through the parser, so identifier-shaped text inside
 * strings, regex literals and object keys is never mistaken for one.
 */
function isReference(node: Node, parent: Node | undefined) {
  if (parent?.type === 'VariableDeclarator' || parent?.type === 'TSTypeAliasDeclaration') {
    return parent.id !== node
  }
  if (parent?.type === 'Property') {
    // `{ a }` reads `a`: its value is the reference, its key is not.
    return parent.computed || parent.key !== node || parent.shorthand
  }
  if (parent?.type === 'TSPropertySignature') return parent.computed || parent.key !== node
  if (parent?.type === 'MemberExpression') return parent.computed || parent.property !== node
  if (parent?.type === 'TSQualifiedName') return parent.left === node
  return true
}

function declaredNames(statement: Statement): readonly string[] {
  const node =
    statement.type === 'ExportNamedDeclaration' && statement.declaration !== null
      ? statement.declaration
      : statement
  if (node.type === 'TSTypeAliasDeclaration') return [node.id.name]
  if (node.type !== 'VariableDeclaration') return []
  return node.declarations.flatMap((d) => (d.id.type === 'Identifier' ? [d.id.name] : []))
}

/** Identifiers the code reads but does not declare at the top level. */
export function collectFreeIdentifiers(code: string): ReadonlySet<string> {
  const { program } = parseSource(code)
  const declared = new Set(program.body.flatMap(declaredNames))
  const used = new Set<string>()
  walk(program, (node, ancestors) => {
    if (
      node.type === 'Identifier' &&
      !declared.has(node.name) &&
      isReference(node, ancestors.at(-1))
    ) {
      used.add(node.name)
    }
  })
  return used
}
