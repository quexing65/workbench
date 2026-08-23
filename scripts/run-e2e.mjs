import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseDirectory = resolve(tmpdir());
const dataDirectory = join(
  baseDirectory,
  `personal-workbench-vnext-e2e-${process.pid}-${Date.now()}`,
);

function cleanup() {
  const resolved = resolve(dataDirectory);
  if (
    !resolved.startsWith(`${baseDirectory}\\`) ||
    !resolved.includes('personal-workbench-vnext-e2e-')
  ) {
    throw new Error('Refusing to remove an unexpected E2E directory');
  }
  rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// Windows 上 playwright 退出只结束 npm 包装器，vite/tsx 子进程会带着端口存活成孤儿，
// 连续两次 e2e 会因此被端口守卫拒绝；结束后按端口连树清掉本次拉起的服务。
function killLingeringServers() {
  const ports = [
    Number(process.env['E2E_API_PORT'] ?? 8790),
    Number(process.env['E2E_WEB_PORT'] ?? 5190),
  ];
  const output = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout ?? '';
  const pids = new Set();
  for (const line of output.split('\n')) {
    const columns = line.trim().split(/\s+/);
    if (
      columns[0] === 'TCP' &&
      columns[3] === 'LISTENING' &&
      ports.some((port) => (columns[1] ?? '').endsWith(`:${port}`))
    ) {
      pids.add(columns[4]);
    }
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', pid, '/T', '/F']);
  }
}

// reuseExistingServer 会复用占用端口的 dev 服务——那是连接真实数据库的实例，
// 端到端用例会把测试数据写进去。启动前硬性校验端口空闲（人工核对 netstat
// 易错，2026-08-24 一次 head 截断漏看 8790 即造成真实库污染）。
// 守卫必须放在本包装器而非 playwright.config：worker 进程会重新加载配置文件，
// 把主进程刚拉起的 webServer 误判为占用。
function assertPortsIdle() {
  if (process.env['CI']) return;
  const ports = [
    Number(process.env['E2E_API_PORT'] ?? 8790),
    Number(process.env['E2E_WEB_PORT'] ?? 5190),
  ];
  const output = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout ?? '';
  const occupiedRows = output.split('\n').filter((line) => {
    const columns = line.trim().split(/\s+/);
    return (
      columns[0] === 'TCP' &&
      columns[3] === 'LISTENING' &&
      ports.some((port) => (columns[1] ?? '').endsWith(`:${port}`))
    );
  });
  if (occupiedRows.length > 0) {
    throw new Error(
      [
        `端口 ${ports.join('、')} 正被占用（通常是正在运行的 dev 服务）。`,
        'Playwright 的 reuseExistingServer 会复用它，把端到端测试数据写进真实数据库。',
        '请先停止 dev 服务，或用 E2E_WEB_PORT/E2E_API_PORT 指定备用端口再运行 e2e。',
        '占用明细：',
        ...occupiedRows.map((line) => line.trim()),
      ].join('\n'),
    );
  }
}

assertPortsIdle();
cleanup();
const playwrightCli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);
const result = spawnSync(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
  env: { ...process.env, WORKBENCH_DATA_DIR: dataDirectory },
  stdio: 'inherit',
});

try {
  cleanup();
  killLingeringServers();
} catch (error) {
  process.stderr.write(
    `E2E data cleanup failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
  );
  process.exitCode = 1;
}

if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
