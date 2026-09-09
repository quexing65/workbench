import { defineConfig } from 'vitest/config';

import {
  baseCoverageThresholds,
  criticalPathCoverageThresholds,
} from './vitest.coverage-thresholds';

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
        'apps/server/src/modules/backups/cli-restore.ts',
        'apps/server/src/performance/cli-audit.ts',
        'apps/desktop/src/main.ts',
        'apps/web/src/main.tsx',
        'packages/shared/src/index.ts',
      ],
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        ...baseCoverageThresholds,
        // 关键路径的严格下限。未参与当前统计范围的 glob（例如 server 运行时的
        // shared 文件）由 vitest 忽略，不影响另一侧的判定。
        'apps/server/src/db/migrate.ts': criticalPathCoverageThresholds,
        'apps/server/src/modules/credentials/**': criticalPathCoverageThresholds,
        'packages/shared/src/domain/learning-progress.ts': criticalPathCoverageThresholds,
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
