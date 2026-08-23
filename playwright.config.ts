import { defineConfig, devices } from '@playwright/test';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = '127.0.0.1';
// e2e 默认占用 dev 端口；开发机 dev 常驻时可经 E2E_WEB_PORT/E2E_API_PORT
// 指定备用端口，与正在运行的服务完全隔离地跑全量用例。
// 端口占用守卫在 scripts/run-e2e.mjs 中执行——不能放本文件：
// Playwright 的 worker 进程会重新加载配置，把主进程刚拉起的 webServer 误判为占用。
const webPort = Number(process.env['E2E_WEB_PORT'] ?? 5190);
const apiPort = Number(process.env['E2E_API_PORT'] ?? 8790);
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
        WORKBENCH_DEV_PORT: String(webPort),
        WORKBENCH_DEV_API_PORT: String(apiPort),
      },
      reuseExistingServer: !isCi,
      stderr: 'pipe',
      stdout: 'pipe',
      timeout: 120_000,
      url: baseURL,
    },
  ],
});
