import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/dist/**',
        'apps/server/src/index.ts',
        'apps/server/src/db/cli-migrate.ts',
        'apps/server/src/modules/imports/cli-import.ts',
        'apps/web/src/main.tsx',
        'packages/shared/src/index.ts',
      ],
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
        'apps/server/src/modules/imports/**': {
          branches: 90,
          functions: 95,
          lines: 95,
          statements: 95,
        },
      },
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    include: [
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/tests/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/*/tests/**/*.test.{ts,tsx}',
    ],
    mockReset: true,
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
