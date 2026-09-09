import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  startEmbeddedServer,
  type EmbeddedServer,
  type EmbeddedServerOptions,
} from '../src/server-process.js';

const migrationDirectory = fileURLToPath(
  new URL('../../server/src/db/migrations', import.meta.url),
);
const dpapiScriptPath = fileURLToPath(new URL('../../server/scripts/dpapi.ps1', import.meta.url));
const savedEnvironment = { ...process.env };

const roots: string[] = [];
const servers: EmbeddedServer[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

function webBuild(): string {
  const directory = temporaryDirectory('workbench-desktop-web-');
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>desktop-shell</title>');
  return directory;
}

async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        reject(new Error('Could not reserve a loopback port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

/** 桌面壳用生产模式启动内嵌服务；测试只需注入隔离的数据目录与端口。 */
async function start(
  dataDirectory: string,
  port: number,
  overrides: Partial<EmbeddedServerOptions> = {},
): Promise<EmbeddedServer> {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    WORKBENCH_DATA_DIR: dataDirectory,
    LOG_LEVEL: 'silent',
  });
  const server = await startEmbeddedServer({
    migrationDirectory,
    dpapiScriptPath,
    webDistDirectory: webBuild(),
    version: '9.9.9-test',
    ...overrides,
  });
  servers.push(server);
  return server;
}

afterEach(() => {
  for (const server of servers.splice(0)) server.stop();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, savedEnvironment);
});

describe('embedded desktop server', () => {
  it('serves health and the injected web build, then releases the data directory', async () => {
    const directory = temporaryDirectory('workbench-desktop-data-');
    const port = await freePort();
    const server = await start(directory, port);

    expect(server).toMatchObject({ host: '127.0.0.1', port });

    const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(health.status).toBe(200);
    const body: unknown = await health.json();
    expect(body).toMatchObject({ status: 'ok', schemaVersion: 5, version: '9.9.9-test' });
    // 正式运行不返回本机绝对数据目录。
    expect(body).not.toHaveProperty('dataDirectory');

    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(await page.text()).toContain('desktop-shell');

    server.stop();
    expect(existsSync(join(directory, '.workbench.lock'))).toBe(false);

    // 锁已释放：同一数据目录可以再次启动。
    const restarted = await start(directory, await freePort());
    expect(restarted.port).toBeGreaterThan(0);
  });

  it('refuses a second embedded server on the same data directory', async () => {
    const directory = temporaryDirectory('workbench-desktop-lock-');
    const first = await start(directory, await freePort());

    await expect(start(directory, await freePort())).rejects.toThrow('already in use');

    first.stop();
  });

  it('releases the data directory when migrations cannot open', async () => {
    const directory = temporaryDirectory('workbench-desktop-migration-');

    await expect(
      start(directory, await freePort(), { migrationDirectory: join(directory, 'missing') }),
    ).rejects.toThrow('Migration directory is unavailable');

    expect(existsSync(join(directory, '.workbench.lock'))).toBe(false);
  });

  it('releases the data directory when the port is already in use', async () => {
    const directory = temporaryDirectory('workbench-desktop-port-');
    const port = await freePort();
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));

    try {
      await expect(start(directory, port)).rejects.toThrow();
      expect(existsSync(join(directory, '.workbench.lock'))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
