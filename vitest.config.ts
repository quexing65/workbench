import { defineConfig } from 'vitest/config';

import { baseCoverageThresholds } from './vitest.coverage-thresholds';

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
        // Type-only module: emits no runtime code, so coverage is always 0%.
        'apps/server/src/modules/imports/contracts.ts',
        'apps/server/src/modules/backups/cli-restore.ts',
        'apps/server/src/performance/cli-audit.ts',
        'apps/server/src/modules/imports/qoder/cli-sanitize.ts',
        'apps/web/src/main.tsx',
        'packages/shared/src/index.ts',
      ],
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        ...baseCoverageThresholds,
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
    // Real DPAPI/PowerShell subprocesses and large import fixtures can exceed
    // 10s on shared CI runners even though they finish in 1-2s locally.
    testTimeout: 30_000,
  },
});
