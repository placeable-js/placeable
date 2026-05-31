import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Re-export barrels, type-only files, and test helpers carry no logic to cover.
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/math/types.ts', 'src/test-utils/**'],
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100,
      },
    },
  },
})
