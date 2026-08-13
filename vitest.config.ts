import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}', '**/dist/**', 'apps/web/src/main.tsx'],
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
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
