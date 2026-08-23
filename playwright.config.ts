import { defineConfig, devices } from '@playwright/test';

import { spawnSync } from 'node:child_process';
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

// reuseExistingServer 在本地会复用占用端口的 dev 服务——那是连接真实数据库的实例，
// 端到端用例会把测试数据写进去。这里在配置加载阶段硬性拒绝，避免人为核对 netstat 出错
// （2026-08-24 一次 head 截断漏看 8790 即造成真实库污染）。
function assertDevPortsIdle(): void {
  if (isCi) return;
  const output = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout ?? '';
  const listening = output
    .split('\n')
    .filter((line) => line.trim().startsWith('TCP') && /\sLISTENING\s/.test(line))
    .map((line) => line.trim().split(/\s+/)[1] ?? '');
  const occupied = [apiPort, webPort].filter((port) =>
    listening.some((address) => address.endsWith(`:${port}`)),
  );
  if (occupied.length > 0) {
    throw new Error(
      [
        `端口 ${occupied.join('、')} 正被占用（通常是正在运行的 dev 服务）。`,
        'Playwright 的 reuseExistingServer 会复用它，把端到端测试数据写进真实数据库。',
        '请先停止 dev 服务再运行 e2e。',
      ].join('\n'),
    );
  }
}

assertDevPortsIdle();

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
