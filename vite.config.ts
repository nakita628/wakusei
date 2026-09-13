import { defineConfig } from 'vite-plus'

// oxlint-disable-next-line import/no-default-export -- Vite resolves the config through its default export
export default defineConfig({
  // Single source of truth for formatting style. Vite+ merges this root config into every
  // workspace config, so `packages/wakusei` inherits these options and only declares what is
  // specific to it.
  //
  // `fmt.ignorePatterns` is inherited too, so keep every pattern here specific enough that it
  // matches nothing inside a workspace (a broad root-relative pattern such as `packages/**`
  // makes the workspaces' own `vp check` exclude every file).
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
    experimentalSortImports: {},
  },
})
