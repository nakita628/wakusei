<!-- The pull request title is the page's top-level heading, so the body starts at `##`. -->

<!-- markdownlint-disable MD041 -->

<!--
Title: `type(scope): summary` — imperative mood, no trailing period.

  type   feat | fix | perf | refactor | docs | test | build | ci | chore
  scope  schemas | components | procedures | contract | merge | config | cli | vite-plugin | test

  fix(merge): keep `.use()` placed after `.input()`
-->

## Why

<!-- The problem or request behind this change. Link the issue: `Closes #123`. -->

## What

<!-- What changed, as someone running the CLI or reading the generated code sees it. -->

## Where

<!-- The part it touches: schemas, components, procedures, contract, merge, config, CLI, watch mode, Vite plugin. -->

## Who

<!-- Who is affected. Breaking for anyone? -->

## When

<!-- Release impact: none | next release | version bumped. -->

## How

<!-- The approach, and how you verified it. For generated output, the lines that changed or a case under test/cases. -->

<!-- textlint-disable no-todo -- the boxes are the checklist to tick, not parked work -->

- [ ] `pnpm check`
- [ ] `pnpm test` (after `vp run wakusei#build`)
- [ ] `pnpm --filter ./test typecheck`, when generated output changed
