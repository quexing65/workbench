import { defineConfig, devices } from '@playwright/test';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = '127.0.0.1';
const webPort = 5190;
const apiPort = 8790;
const baseURL = `http://${host}:${webPort}`;
const isCi = Boolean(process.env['CI']);
const dataDirectory =
  process.env['WORKBENCH_DATA_DIR'] ??
  join(tmpdir(), `personal-workbench-vnext-e2e-${process.pid}`);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: 1,
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
        WORKBENCH_DATA_DIR: dataDirectory,
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
