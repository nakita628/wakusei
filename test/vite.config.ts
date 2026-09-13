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
    // Generated output is checked by tsc per case, not linted. Overlays are handler bodies that
    // only become valid once merged into generated code, so they are left out as well.
    ignorePatterns: ['**/node_modules/**', '__generated__/**', 'overlays/**', 'cases/*/overlay/**'],
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
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/no-explicit-any': 'error',
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
