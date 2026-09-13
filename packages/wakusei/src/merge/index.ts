import type { CallExpression, ImportDeclaration, SourceFile, VariableStatement } from 'ts-morph'
import { Node, Project, SyntaxKind } from 'ts-morph'

/** The chain calls the generator writes; a `.use()` is re-inserted before the one it preceded. */
const GENERATED_METHODS: ReadonlySet<string> = new Set(['route', 'input', 'output', 'handler'])

/** Packages whose imports the generator always owns. */
const GENERATED_PACKAGES = ['@orpc/server', '@orpc/contract', 'zod', 'valibot', 'arktype']

type Customization = {
  readonly handlerBody: string
  /** `.use(...)` calls, each with the generated call it stood before. */
  readonly useNodes: readonly { readonly text: string; readonly beforeMethod: string }[]
  /** Whatever follows `.handler(...)` (`.callable()`, `.actionable()`, …). */
  readonly postHandler: string
}

function parse(code: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile('file.ts', code)
}

function isMethodCall(call: CallExpression, name: string) {
  const expr = call.getExpression()
  return Node.isPropertyAccessExpression(expr) && expr.getName() === name
}

function findHandlerCall(stmt: VariableStatement) {
  return stmt
    .getDeclarations()[0]
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => isMethodCall(call, 'handler'))
}

function getHandlerBodyNode(call: CallExpression | undefined) {
  const arg = call?.getArguments()[0]
  if (Node.isArrowFunction(arg)) {
    const body = arg.getBody()
    return Node.isBlock(body) ? body : undefined
  }
  return Node.isFunctionExpression(arg) ? arg.getBody() : undefined
}

function isStubBody(body: string) {
  return body.replaceAll(/\s/gu, '') === '{}'
}

/** The generated call a `.use(...)` precedes: `a.use(x).route(...)` → `route`. */
function findNextGeneratedMethod(useCall: Node) {
  const parent = useCall.getParent()
  const grandParent = parent?.getParent()
  if (!Node.isPropertyAccessExpression(parent) || !Node.isCallExpression(grandParent)) {
    return 'route'
  }
  const gpExpr = grandParent.getExpression()
  if (Node.isPropertyAccessExpression(gpExpr) && GENERATED_METHODS.has(gpExpr.getName())) {
    return gpExpr.getName()
  }
  const outerParent = grandParent.getParent()
  if (
    Node.isPropertyAccessExpression(outerParent) &&
    GENERATED_METHODS.has(outerParent.getName())
  ) {
    return outerParent.getName()
  }
  return 'route'
}

function extractCustomization(stmt: VariableStatement): Customization {
  const calls = stmt.getDeclarations()[0]?.getDescendantsOfKind(SyntaxKind.CallExpression) ?? []
  const handlerCall = findHandlerCall(stmt)
  const useNodes = calls
    .filter((call) => isMethodCall(call, 'use'))
    .map((call) => ({
      text: `.use(${call
        .getArguments()
        .map((arg) => arg.getText())
        .join(', ')})`,
      beforeMethod: findNextGeneratedMethod(call),
    }))
  const postHandler = handlerCall
    ? stmt
        .getText()
        .slice(handlerCall.getEnd() - stmt.getStart())
        .trimEnd()
    : ''
  return {
    handlerBody: getHandlerBodyNode(handlerCall)?.getText() ?? '{}',
    useNodes,
    postHandler,
  }
}

function exportedStatements(file: SourceFile) {
  return file.getVariableStatements().flatMap((stmt) => {
    const name = stmt.getDeclarations()[0]?.getName()
    return stmt.isExported() && name !== undefined ? [[name, stmt] as const] : []
  })
}

/** Re-applies the user's `.use()` calls, handler body and post-handler calls to a generated statement. */
function mergeChain(generated: string, custom: Customization) {
  const stmt = parse(generated).getVariableStatements()[0]
  const decl = stmt?.getDeclarations()[0]
  if (!decl) return generated
  const calls = decl.getDescendantsOfKind(SyntaxKind.CallExpression)
  const useInsertions = custom.useNodes.flatMap((useNode) => {
    const expr = calls.find((call) => isMethodCall(call, useNode.beforeMethod))?.getExpression()
    if (!Node.isPropertyAccessExpression(expr)) return []
    const pos = expr.getNameNode().getStart() - 1
    return [{ start: pos, end: pos, insert: useNode.text }]
  })
  const body = isStubBody(custom.handlerBody)
    ? undefined
    : getHandlerBodyNode(calls.find((call) => isMethodCall(call, 'handler')))
  const replacements = [
    ...useInsertions,
    ...(body ? [{ start: body.getStart(), end: body.getEnd(), insert: custom.handlerBody }] : []),
  ].toSorted((a, b) => b.start - a.start)
  const merged = replacements.reduce(
    (text, rep) => `${text.slice(0, rep.start)}${rep.insert}${text.slice(rep.end)}`,
    generated,
  )
  return `${merged}${custom.postHandler}`
}

function importText(decl: ImportDeclaration) {
  const text = decl.getText()
  return text.endsWith(';') ? text.slice(0, -1) : text
}

/** The generated imports, then every existing import the generator does not own. */
function mergeImports(existing: SourceFile, generated: SourceFile, managed: ReadonlySet<string>) {
  const generatedImports = generated.getImportDeclarations()
  const generatedSpecifiers = new Set(generatedImports.map((d) => d.getModuleSpecifierValue()))
  const isOwned = (specifier: string) =>
    managed.has(specifier) ||
    generatedSpecifiers.has(specifier) ||
    GENERATED_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))
  const userImports = existing
    .getImportDeclarations()
    .filter((decl) => !isOwned(decl.getModuleSpecifierValue()))
  return [...generatedImports, ...userImports].map(importText).join('\n')
}

/**
 * Regenerates a procedure file while keeping what the user wrote: handler bodies,
 * `.use()` middleware in its position, calls after `.handler(...)`, and imports from
 * modules the generator does not own (`managed` lists the project modules it does).
 * Procedures the spec no longer has are dropped; new ones arrive as stubs.
 */
export function mergeProcedureFile(
  existing: string,
  generated: string,
  managed: ReadonlySet<string> = new Set(),
) {
  const existingFile = parse(existing)
  const generatedFile = parse(generated)
  const customizations = new Map(
    exportedStatements(existingFile).map(([name, stmt]) => [name, extractCustomization(stmt)]),
  )
  if (customizations.size === 0) return generated
  const sections = exportedStatements(generatedFile).flatMap(([name, stmt]) => {
    if (!findHandlerCall(stmt)) return []
    const text = stmt.getText()
    const custom = customizations.get(name)
    const hasUserCode =
      custom !== undefined &&
      (!isStubBody(custom.handlerBody) || custom.useNodes.length > 0 || custom.postHandler !== '')
    return [custom && hasUserCode ? mergeChain(text, custom) : text]
  })
  // Statements that are not exported procedures (`const os=implement(contract)`) are the
  // generator's own and come back as generated.
  const preamble = generatedFile
    .getStatements()
    .filter(
      (stmt) =>
        !Node.isImportDeclaration(stmt) && !(Node.isVariableStatement(stmt) && stmt.isExported()),
    )
    .map((stmt) => stmt.getText())
  const imports = mergeImports(existingFile, generatedFile, managed)
  return `${[imports, ...preamble, ...sections].filter((part) => part !== '').join('\n\n')}\n`
}
