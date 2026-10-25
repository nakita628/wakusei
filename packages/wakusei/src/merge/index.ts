import type {
  BlockStatement,
  CallExpression,
  ExportNamedDeclaration,
  FunctionBody,
  ImportDeclaration,
  Node,
  Program,
} from 'oxc-parser'

import { parseSource, textOf, walk } from '../syntax/index.js'

/** The chain calls the generator writes; a `.use()` is re-inserted before the one it preceded. */
const GENERATED_METHODS: ReadonlySet<string> = new Set(['route', 'input', 'output', 'handler'])

/** Packages whose imports the generator always owns. */
const GENERATED_PACKAGES = ['@orpc/server', '@orpc/contract', 'zod', 'valibot', 'arktype']

/**
 * A parsed file. The tree is read for positions and names only; every piece of text that is
 * kept or moved is sliced from `code`, so comments and formatting survive a merge.
 */
type Source = {
  readonly code: string
  readonly program: Program
  readonly errors: readonly string[]
}

/** `export const name = …`, with the chain calls under it in walk order. */
type Procedure = {
  readonly name: string
  readonly statement: ExportNamedDeclaration
  readonly calls: readonly ChainCall[]
}

/**
 * A call under a procedure. `method` is the name of a `.method(...)` call; `next` is the
 * generated call a `.use(...)` precedes — `a.use(x).route(...)` → `route`.
 */
type ChainCall = {
  readonly call: CallExpression
  readonly method: string | undefined
  readonly next: string
}

type Customization = {
  readonly handlerBody: string
  /** `.use(...)` calls, each with the generated call it stood before. */
  readonly useNodes: readonly { readonly text: string; readonly beforeMethod: string }[]
  /** Whatever follows `.handler(...)` (`.callable()`, `.actionable()`, …). */
  readonly postHandler: string
}

function parse(code: string): Source {
  return { code, ...parseSource(code) }
}

/** The name of the method `node` calls, for a `.name(...)` call. */
function methodOf(node: Node | undefined) {
  return node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier'
    ? node.callee.property.name
    : undefined
}

function memberName(node: Node | undefined) {
  return node?.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
    ? node.property.name
    : undefined
}

/**
 * The generated call a `.use(...)` precedes: the call made on its result, or, for one
 * `.use()` after another, the call made on that one's.
 */
function nextGeneratedMethod(ancestors: readonly Node[]) {
  const parent = memberName(ancestors.at(-1))
  if (ancestors.at(-2)?.type !== 'CallExpression' || parent === undefined) return 'route'
  if (GENERATED_METHODS.has(parent)) return parent
  const outer = memberName(ancestors.at(-3))
  return outer !== undefined && GENERATED_METHODS.has(outer) ? outer : 'route'
}

function chainCalls(node: Node): readonly ChainCall[] {
  const calls: ChainCall[] = []
  walk(node, (candidate, ancestors) => {
    if (candidate.type !== 'CallExpression') return
    const method = methodOf(candidate)
    calls.push({
      call: candidate,
      method,
      next: method === 'use' ? nextGeneratedMethod(ancestors) : 'route',
    })
  })
  return calls
}

function procedures(source: Source): readonly Procedure[] {
  return source.program.body.flatMap((statement) => {
    if (
      statement.type !== 'ExportNamedDeclaration' ||
      statement.declaration?.type !== 'VariableDeclaration'
    ) {
      return []
    }
    const declarator = statement.declaration.declarations[0]
    if (declarator?.id.type !== 'Identifier') return []
    return [{ name: declarator.id.name, statement, calls: chainCalls(declarator) }]
  })
}

function findCall(procedure: Procedure, method: string) {
  return procedure.calls.find((entry) => entry.method === method)?.call
}

function handlerBodyOf(
  call: CallExpression | undefined,
): BlockStatement | FunctionBody | undefined {
  const arg = call?.arguments[0]
  if (arg?.type === 'ArrowFunctionExpression') {
    return arg.body.type === 'BlockStatement' ? arg.body : undefined
  }
  return arg?.type === 'FunctionExpression' ? (arg.body ?? undefined) : undefined
}

function isStubBody(body: string) {
  return body.replaceAll(/\s/gu, '') === '{}'
}

function extractCustomization(source: Source, procedure: Procedure): Customization {
  const { code } = source
  const handlerCall = findCall(procedure, 'handler')
  const useNodes = procedure.calls
    .filter((entry) => entry.method === 'use')
    .map((entry) => ({
      text: `.use(${entry.call.arguments.map((arg) => textOf(code, arg)).join(', ')})`,
      beforeMethod: entry.next,
    }))
  const postHandler = handlerCall
    ? code.slice(handlerCall.end, procedure.statement.end).trimEnd()
    : ''
  const body = handlerBodyOf(handlerCall)
  return {
    handlerBody: body ? textOf(code, body) : '{}',
    useNodes,
    postHandler,
  }
}

function hasUserCode(custom: Customization) {
  return !isStubBody(custom.handlerBody) || custom.useNodes.length > 0 || custom.postHandler !== ''
}

/** Re-applies the user's `.use()` calls, handler body and post-handler calls to a generated statement. */
function mergeChain(source: Source, procedure: Procedure, custom: Customization) {
  const { start } = procedure.statement
  const useInsertions = custom.useNodes.flatMap((useNode) => {
    const callee = findCall(procedure, useNode.beforeMethod)?.callee
    if (callee?.type !== 'MemberExpression' || callee.computed) return []
    const pos = callee.property.start - 1 - start
    return [{ start: pos, end: pos, insert: useNode.text }]
  })
  const body = isStubBody(custom.handlerBody)
    ? undefined
    : handlerBodyOf(findCall(procedure, 'handler'))
  const replacements = [
    ...useInsertions,
    ...(body
      ? [{ start: body.start - start, end: body.end - start, insert: custom.handlerBody }]
      : []),
  ].toSorted((a, b) => b.start - a.start)
  const merged = replacements.reduce(
    (text, rep) => `${text.slice(0, rep.start)}${rep.insert}${text.slice(rep.end)}`,
    textOf(source.code, procedure.statement),
  )
  return `${merged}${custom.postHandler}`
}

function importsOf(source: Source) {
  return source.program.body.filter(
    (statement): statement is ImportDeclaration => statement.type === 'ImportDeclaration',
  )
}

function importText(code: string, decl: ImportDeclaration) {
  const text = textOf(code, decl)
  return text.endsWith(';') ? text.slice(0, -1) : text
}

/** The generated imports, then every existing import the generator does not own. */
function mergeImports(existing: Source, generated: Source, managed: ReadonlySet<string>) {
  const generatedImports = importsOf(generated)
  const generatedSpecifiers = new Set(generatedImports.map((d) => d.source.value))
  const isOwned = (specifier: string) =>
    managed.has(specifier) ||
    generatedSpecifiers.has(specifier) ||
    GENERATED_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))
  const userImports = importsOf(existing).filter((decl) => !isOwned(decl.source.value))
  return [
    ...generatedImports.map((decl) => importText(generated.code, decl)),
    ...userImports.map((decl) => importText(existing.code, decl)),
  ].join('\n')
}

/**
 * Regenerates a procedure file while keeping what the user wrote: handler bodies,
 * `.use()` middleware in its position, calls after `.handler(...)`, and imports from
 * modules the generator does not own (`managed` lists the project modules it does).
 * Procedures the spec no longer has are dropped; new ones arrive as stubs.
 *
 * An existing file that does not parse has an empty tree, in which every procedure looks
 * missing: merging would write the stubs over the edit that broke it. It is returned as it
 * is instead, and the merge is taken up on the first run after it parses again.
 */
export function mergeProcedureFile(
  existing: string,
  generated: string,
  managed: ReadonlySet<string> = new Set(),
) {
  const existingFile = parse(existing)
  if (existingFile.errors.length > 0) return existing
  const customizations = new Map(
    procedures(existingFile).map((procedure) => [
      procedure.name,
      extractCustomization(existingFile, procedure),
    ]),
  )
  if (customizations.size === 0) return generated
  const generatedFile = parse(generated)
  const sections = procedures(generatedFile).flatMap((procedure) => {
    if (!findCall(procedure, 'handler')) return []
    const custom = customizations.get(procedure.name)
    return [
      custom && hasUserCode(custom)
        ? mergeChain(generatedFile, procedure, custom)
        : textOf(generated, procedure.statement),
    ]
  })
  // Statements that are not exported procedures (`const os=implement(contract)`) are the
  // generator's own and come back as generated.
  const preamble = generatedFile.program.body
    .filter(
      (statement) =>
        statement.type !== 'ImportDeclaration' &&
        !(
          statement.type === 'ExportNamedDeclaration' &&
          statement.declaration?.type === 'VariableDeclaration'
        ),
    )
    .map((statement) => textOf(generated, statement))
  const imports = mergeImports(existingFile, generatedFile, managed)
  return `${[imports, ...preamble, ...sections].filter((part) => part !== '').join('\n\n')}\n`
}
