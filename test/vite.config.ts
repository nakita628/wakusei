import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['runtime/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    // Regenerates __generated__ from the cases before the suite runs (needs wakusei built).
    globalSetup: ['./scripts/global-setup.ts'],
    // The Vite plugin suite changes the working directory, which needs per-file processes.
    pool: 'forks',
    // Real generation, tsc over every case and a Vite dev server are slow on a busy machine.
    testTimeout: 120_000,
  },
  lint: {
    ignorePatterns: [
      '**/node_modules/**',
      '__generated__/**',
      // Overlay sources are copy templates completed inside __generated__/<case>
      // after generation; they only resolve in that destination, where the per-case
      // tsc checks them.
      'overlays/**',
      'cases/*/overlay/**',
    ],
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add
    // import and vitest (every source here is test code or its harness).
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'vitest'],
    options: {
      typeAware: true,
      typeCheck: true,
      reportUnusedDisableDirectives: 'deny',
      denyWarnings: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    // Everything under test/ is test code or its harness. Rules in correctness /
    // suspicious / perf are already errors via `categories`; this list adds the
    // pedantic / style rules the package config also holds, minus the ones that
    // only make sense in `src` (no-console, default-export bans on fixtures).
    rules: {
      eqeqeq: 'error',
      'no-new-func': 'error',
      'no-return-assign': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'prefer-object-spread': 'error',
      'symbol-description': 'error',
      'typescript/no-deprecated': 'error',
      'typescript/restrict-plus-operands': 'error',
      'typescript/no-confusing-void-expression': 'error',
      'typescript/only-throw-error': 'error',
      'typescript/prefer-promise-reject-errors': 'error',
      'typescript/prefer-reduce-type-parameter': 'error',
      'typescript/prefer-includes': 'error',
      'typescript/prefer-string-starts-ends-with': 'error',
      'typescript/prefer-optional-chain': 'error',
      'typescript/use-unknown-in-catch-callback-variable': 'error',
      'typescript/return-await': 'error',
      'unicorn/no-await-expression-member': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/throw-new-error': 'error',
      'import/no-mutable-exports': 'error',
      'import/first': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-plusplus': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-misused-promises': 'error',
      'typescript/require-await': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/prefer-nullish-coalescing': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'unicorn/no-array-for-each': 'error',
      // Runtime tests are type-checked per case with lib ES2022, which predates `toSorted`.
      'unicorn/no-array-sort': 'off',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'import/no-cycle': 'error',
      'import/no-duplicates': 'error',
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'vitest/consistent-test-it': 'error',
      'vitest/prefer-each': 'error',
      'vitest/valid-title': 'error',
    },
  },
  fmt: {
    ignorePatterns: ['**/node_modules/**', '__generated__/**'],
  },
})
