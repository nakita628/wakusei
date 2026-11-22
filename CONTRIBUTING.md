# Contributing to Wakusei

Thank you for considering a contribution! Wakusei generates oRPC code (zod / valibot / arktype schemas, `@orpc/server` procedures or an `@orpc/contract` router) from OpenAPI or TypeSpec. This guide explains how we'd like you to contribute.

## Ways to contribute

- **Bug reports**: use the [Bug Report template](https://github.com/nakita628/wakusei/issues/new?template=bug-report.md). A minimal OpenAPI document that reproduces the problem, plus the actual and expected generated code, is the fastest path to a fix.
- **Feature requests**: use the [Feature Request template](https://github.com/nakita628/wakusei/issues/new?template=feature-request.md). For anything that changes generated output or adds a config option, please open an issue **before** writing code so we can agree on the design.
- **Bugfix PRs**: small, focused fixes can go straight to a PR.
- **Docs**: README examples must work as-is when pasted into a project.

## Development setup

Requirements: **Node.js 22** and the pnpm version in `packageManager` of the root `package.json` (`corepack enable` is the easiest way).

```bash
git clone https://github.com/nakita628/wakusei.git
cd wakusei
pnpm install
```

Run these from the repository root:

```bash
vp run wakusei#build  # build packages/wakusei/dist; the test/ suite and the examples run it
pnpm check            # oxfmt, oxlint, the type check, then `pnpm lint` (every repository linter)
pnpm fix              # autofix formatting, oxlint, markdownlint and textlint
pnpm test             # unit tests, then the test/ suite over the built CLI
```

Before opening a PR, `pnpm check` and `pnpm test` must both pass; CI runs the same commands.

- **Generated output changed?** Read the changed test expectations and decide whether the new output is right before updating them. Then regenerate the examples, `vp run --filter './examples/*' generate`, and commit the diff: CI fails when regenerating changes them. `pnpm --filter ./test typecheck` type-checks every case under `test/cases`.
- **A behavior change ships with a test** that fails before it and passes after.
- **A change to the config, the CLI, the Vite plugin or the generated output updates the README** (`packages/wakusei/README.md`; the root `README.md` is a symlink to it) in the same change.

## Coding rules

The rules live in `.cursor/rules/*.mdc`, and most are enforced by `pnpm check` (the `lint` section of `packages/wakusei/vite.config.ts` and the oxlint plugin in `packages/wakusei/lint/`). Read the ones for the files you touch: `project.mdc` (always), `architecture.mdc`, `effect.mdc`, `typescript.mdc`, `testing.mdc`, `docs.mdc` and `ci-config.mdc`. In short:

- Implement it the way the surrounding code is written; do not introduce a second idiom.
- Failures are typed Effect errors, never throws.
- The handler directories hold the user's code: they are merged, never deleted or overwritten.
- Never relax a linter to get a change through, and never hand-edit `pnpm-lock.yaml`, `dist/` or `coverage/`.
- Everything committed is written in English.

## Commits and pull requests

Commit subjects and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): imperative summary`, with no trailing period. PRs are squash-merged, so the PR title becomes the commit on `main`, and its type decides the release:

| Type                                               | Release                          |
| -------------------------------------------------- | -------------------------------- |
| `feat`                                             | minor                            |
| `fix`, `perf`                                      | patch                            |
| `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer  | minor while the version is `0.x` |
| `refactor`, `docs`, `test`, `build`, `ci`, `chore` | none                             |

Scopes: `schemas`, `components`, `procedures`, `contract`, `merge`, `config`, `cli`, `vite-plugin`, `test`.

Fill in `.github/pull_request_template.md`, and link the issue with `Closes #<number>`.

## Releases

Releases are automatic. Never bump `version` or push a `v*` tag by hand.

1. When a `feat`, `fix` or `perf` lands on `main`, the Release PR workflow (`.github/workflows/release-please.yml`) opens `chore: bump version to <version>` and merges it.
2. `.github/workflows/release.yml` then runs Test, tags `v<version>`, publishes to npm through Trusted Publishing and writes the GitHub Release.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
