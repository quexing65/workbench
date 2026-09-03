import { setTimeout as delay } from 'node:timers/promises';

const host = '127.0.0.1';
const apiPort = Number(process.env['E2E_API_PORT'] ?? 8790);
const healthUrl = `http://${host}:${apiPort}/api/v1/health`;
const ISOLATED_DATA_DIR_MARKER = 'personal-workbench-vnext-e2e-';

interface HealthPayload {
  readonly dataDirectory: string;
}

async function waitForHealth(): Promise<HealthPayload> {
  // 正常路径下 webServer 已就绪（Playwright 先拉服务再跑 globalSetup），
  // 重试只为覆盖手工执行 globalSetup 或服务慢启动的场景。
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
      if (response.ok) return (await response.json()) as HealthPayload;
    } catch {
      // 服务仍在启动，继续重试
    }
    await delay(1_000);
  }
  throw new Error(`健康检查持续不可达：${healthUrl}`);
}

// 端口守卫（scripts/run-e2e.mjs）拦住了“dev 服务占用端口”的常见场景，
// 但绕过包装器直接 `npx playwright test` 时，reuseExistingServer 仍会复用
// 连着真实数据库的 dev 服务，把测试数据写进去（2026-08 真实库即被这样污染）。
// 这里是最后一道防线：任何用例写入数据前，先确认 API 连的是本次运行专属的
// 临时数据目录，否则让整轮测试失败。
export default async function globalSetup(): Promise<void> {
  const health = await waitForHealth();
  if (!health.dataDirectory.includes(ISOLATED_DATA_DIR_MARKER)) {
    throw new Error(
      [
        `E2E 中止：API 服务的数据目录是 ${health.dataDirectory}，不是隔离的临时目录。`,
        '继续执行会把测试数据写进真实数据库。通常是 Playwright 复用了正在运行的 dev 服务：',
        '请先停止 dev 服务，或用 E2E_WEB_PORT/E2E_API_PORT 指定备用端口后重试。',
      ].join('\n'),
    );
  }
}
