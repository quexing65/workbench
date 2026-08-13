import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const webPort = 5190;
const apiPort = 8790;
const baseURL = `http://${host}:${webPort}`;
const isCi = Boolean(process.env['CI']);
const dataDir = process.env['WORKBENCH_DATA_DIR'] ?? join(tmpdir(), 'personal-workbench-vnext-e2e');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: isCi
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w @workbench/server',
      env: {
        APP_TIME_ZONE: 'Asia/Shanghai',
        BILI_SYNC_ENABLED: 'false',
        HOST: host,
        PORT: String(apiPort),
        WEB_DEV_ORIGIN: baseURL,
        WORKBENCH_DATA_DIR: dataDir,
      },
      reuseExistingServer: !isCi,
      stderr: 'pipe',
      stdout: 'pipe',
      timeout: 120_000,
      url: `http://${host}:${apiPort}/api/v1/health`,
    },
    {
      command: 'npm run dev -w @workbench/web',
      env: {
        HOST: host,
      },
      reuseExistingServer: !isCi,
      stderr: 'pipe',
      stdout: 'pipe',
      timeout: 120_000,
      url: baseURL,
    },
  ],
});
