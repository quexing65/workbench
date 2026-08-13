import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = 8791;
const origin = `http://${host}:${port}`;
const maximumNavigationMs = 3_000;
const maximumInteractionMs = 1_500;
const maximumDomElements = 5_000;
const root = resolve(import.meta.dirname, '..');
const temporaryRoot = resolve(mkdtempSync(join(tmpdir(), 'workbench-browser-performance-')));
if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
  throw new Error('Performance directory was created outside the system temporary directory');
}
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex === -1 ? undefined : process.argv.at(outputIndex + 1);

if (outputIndex !== -1 && output === undefined) throw new Error('--output requires a file path');

function elapsed(started) {
  return Math.round((performance.now() - started) * 100) / 100;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/v1/health`, {
        headers: { Host: `${host}:${port}` },
      });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Performance server did not become healthy');
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function measurePage(page, path, expectedApiPath, ready) {
  const started = performance.now();
  const apiResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === expectedApiPath && candidate.ok();
  });
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  if (response === null || !response.ok()) throw new Error(`${path} navigation failed`);
  await apiResponse;
  await ready();
  const navigationMs = elapsed(started);
  const domElements = await page.locator('*').count();
  const apiResources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/api/v1/'))
      .map((entry) => ({
        path: new URL(entry.name).pathname,
        durationMs: Math.round(entry.duration * 100) / 100,
      })),
  );
  return { path, navigationMs, domElements, apiResources };
}

async function measureInteraction(operation) {
  const started = performance.now();
  await operation();
  return elapsed(started);
}

async function audit(browser) {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  const pages = [];

  pages.push(
    await measurePage(page, '/overview', '/api/v1/overview', () =>
      page.getByRole('heading', { name: '过期待办' }).waitFor(),
    ),
  );
  pages.push(
    await measurePage(page, '/tasks', '/api/v1/tasks', () =>
      page.locator('.work-list .work-item').first().waitFor(),
    ),
  );
  const taskDateChangeMs = await measureInteraction(async () => {
    const response = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/v1/tasks?date=2026-08-14'),
    );
    await page.getByLabel('切换日期').fill('2026-08-14');
    await response;
    await page.locator('.work-list .work-item').first().waitFor();
  });

  pages.push(
    await measurePage(page, '/notes', '/api/v1/notes', () =>
      page.locator('.note-grid .note-card').first().waitFor(),
    ),
  );
  const noteSearchMs = await measureInteraction(async () => {
    const response = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/v1/notes?q='),
    );
    await page.getByLabel('搜索').fill('Performance note 9999');
    await response;
    await page.getByText('Performance note 9999', { exact: true }).waitFor();
  });

  pages.push(
    await measurePage(page, '/learning', '/api/v1/learning/resources', () =>
      page.locator('.learning-card').first().waitFor(),
    ),
  );
  const seriesEditMs = await measureInteraction(async () => {
    await page
      .getByRole('button', { name: /编辑系列 Performance series/u })
      .first()
      .click();
    await page.getByLabel('添加资源').waitFor();
  });
  const learningSeriesEditorDomElements = await page.locator('*').count();
  pages.push(
    await measurePage(page, '/review', '/api/v1/review', () =>
      page.locator('.review-totals').waitFor(),
    ),
  );
  const reviewRangeChangeMs = await measureInteraction(async () => {
    const response = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/v1/review?'),
    );
    await page.getByRole('button', { name: '近 30 天' }).click();
    await response;
    await page.getByRole('button', { name: '近 30 天' }).waitFor();
  });

  await context.close();
  const interactions = { taskDateChangeMs, noteSearchMs, seriesEditMs, reviewRangeChangeMs };
  const expandedStates = { learningSeriesEditorDomElements };
  const failures = [
    ...pages
      .filter((entry) => entry.navigationMs > maximumNavigationMs)
      .map((entry) => `${entry.path} exceeded navigation budget`),
    ...pages
      .filter((entry) => entry.domElements > maximumDomElements)
      .map((entry) => `${entry.path} exceeded DOM budget`),
    ...Object.entries(interactions)
      .filter(([, value]) => value > maximumInteractionMs)
      .map(([name]) => `${name} exceeded interaction budget`),
    ...(learningSeriesEditorDomElements > maximumDomElements
      ? ['learning series editor exceeded DOM budget']
      : []),
  ];
  return {
    generatedAt: new Date().toISOString(),
    fixture: {
      tasks: 10_000,
      notes: 10_000,
      learningResources: 1_000,
      learningSeries: 10,
    },
    budgets: { maximumNavigationMs, maximumInteractionMs, maximumDomElements },
    pages,
    interactions,
    expandedStates,
    failures,
    passed: failures.length === 0,
  };
}

let server;
let browser;
try {
  const { openWorkbenchDatabase } = await import('../apps/server/dist/db/connection.js');
  const { populatePerformanceFixture } = await import('../apps/server/dist/performance/audit.js');
  const database = openWorkbenchDatabase({ dataDirectory: temporaryRoot });
  try {
    populatePerformanceFixture(database.connection);
  } finally {
    database.close();
  }

  server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      APP_TIME_ZONE: 'Asia/Shanghai',
      BILI_SYNC_ENABLED: 'false',
      HOST: host,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'production',
      PORT: String(port),
      WEB_DEV_ORIGIN: origin,
      WORKBENCH_DATA_DIR: temporaryRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();
  browser = await chromium.launch();
  const report = await audit(browser);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) process.stdout.write(json);
  else {
    const outputPath = resolve(process.env['INIT_CWD'] ?? process.cwd(), output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, json, 'utf8');
    const prettier = fileURLToPath(
      new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
    );
    const formatted = spawnSync(process.execPath, [prettier, outputPath, '--write'], {
      encoding: 'utf8',
    });
    if (formatted.error !== undefined) throw formatted.error;
    if (formatted.status !== 0) throw new Error('Browser performance report formatting failed');
  }
  process.stdout.write(
    `Browser performance audit ${report.passed ? 'passed' : 'failed'}: ${report.pages.length} pages, ${report.failures.length} failures.\n`,
  );
  for (const failure of report.failures) process.stderr.write(`${failure}\n`);
  if (!report.passed) process.exitCode = 1;
} finally {
  if (browser !== undefined) await browser.close();
  if (server !== undefined) await stopServer(server);
  rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
