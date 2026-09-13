import { ts } from 'ts-morph'

/**
 * Identifier handling on generated source goes through the TypeScript parser, so
 * identifier-shaped text inside strings, regex literals and object keys is never
 * mistaken for a reference.
 */
function parse(code: string) {
  return ts.createSourceFile('generated.ts', code, ts.ScriptTarget.Latest, true)
}

/** A declaration's own name, an object key or a member name is not a reference. */
function isReference(node: ts.Identifier) {
  const parent = node.parent
  if (ts.isQualifiedName(parent)) return parent.left === node
  if (
    ts.isVariableDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyAccessExpression(parent)
  ) {
    return parent.name !== node
  }
  return true
}

function collectReferences(source: ts.SourceFile) {
  const visit = (node: ts.Node): readonly ts.Identifier[] => [
    ...(ts.isIdentifier(node) && isReference(node) ? [node] : []),
    ...node.getChildren(source).flatMap(visit),
  ]
  return visit(source)
}

/** Identifiers the code reads but does not declare at the top level. */
export function collectFreeIdentifiers(code: string): ReadonlySet<string> {
  const source = parse(code)
  const declared = new Set(
    source.statements.flatMap((statement) => {
      if (ts.isTypeAliasDeclaration(statement)) return [statement.name.text]
      if (!ts.isVariableStatement(statement)) return []
      return statement.declarationList.declarations.flatMap((d) =>
        ts.isIdentifier(d.name) ? [d.name.text] : [],
      )
    }),
  )
  return new Set(
    collectReferences(source)
      .map((node) => node.text)
      .filter((name) => !declared.has(name)),
  )
}
