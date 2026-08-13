import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8790',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    css: true,
    restoreMocks: true,
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}', '**/dist/**', 'src/main.tsx'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: '../../coverage/web',
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
