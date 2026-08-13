import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BiliSessionClient } from '../src/modules/bili/session-client.js';
import type { BrowserCredentialAdapter } from '../src/modules/credentials/cdp-adapter.js';
import { MemoryCredentialStore } from '../src/modules/credentials/store.js';
import { openWorkbenchDatabase } from '../src/db/connection.js';
import { createLogger } from '../src/http/logger.js';
import { allowedHost, makeApp, testConfig } from './test-app.js';

function write(path: string) {
  return request(app())
    .post(path)
    .set('Host', allowedHost)
    .set('Origin', 'http://127.0.0.1:5190')
    .set('X-Workbench-Request', '1')
    .set('Content-Type', 'application/json');
}

const store = new MemoryCredentialStore();
const bili: BiliSessionClient = {
  verifyCredential: vi.fn().mockResolvedValue(true),
  getHistory: vi.fn(),
};
const browser: BrowserCredentialAdapter = {
  fetch: vi.fn().mockResolvedValue({ kind: 'restartRequired' }),
};
function app() {
  return makeApp({
    credentialStore: store,
    biliSessionClient: bili,
    browserCredentialAdapter: browser,
  });
}

beforeEach(() => {
  vi.mocked(bili.verifyCredential).mockResolvedValue(true);
  vi.mocked(browser.fetch).mockResolvedValue({ kind: 'restartRequired' });
});

describe('credential API', () => {
  it('saves and reports only the generic credential state', async () => {
    await store.clear();
    const sentinel = 'api-credential-sentinel';
    const saved = await request(app())
      .put('/api/v1/bili/credential')
      .set('Host', allowedHost)
      .set('Origin', 'http://127.0.0.1:5190')
      .set('X-Workbench-Request', '1')
      .set('Content-Type', 'application/json')
      .send({ sessdata: sentinel });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain(sentinel);
    expect(saved.body).toEqual({ present: true, valid: true, userLabel: '已连接' });

    const status = await request(app())
      .get('/api/v1/bili/credential/status')
      .set('Host', allowedHost);
    expect(status.body).toEqual({ present: true, valid: true, userLabel: '已连接' });
    expect(JSON.stringify(status.body)).not.toContain(sentinel);
  });

  it('rejects force restart without the fixed confirmation', async () => {
    const response = await write('/api/v1/bili/credential/fetch').send({
      browser: 'edge',
      forceRestart: true,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BROWSER_RESTART_CONFIRMATION_REQUIRED');
    expect(browser.fetch).not.toHaveBeenCalled();
  });

  it('clears the encrypted credential without returning it', async () => {
    await store.write('clear-sentinel');
    const response = await request(app())
      .delete('/api/v1/bili/credential')
      .set('Host', allowedHost)
      .set('Origin', 'http://127.0.0.1:5190')
      .set('X-Workbench-Request', '1')
      .set('Content-Type', 'application/json');
    expect(response.status).toBe(204);
    expect(await store.has()).toBe(false);
  });

  it('keeps credential material out of API responses, logs and SQLite', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-secret-scan-'));
    const database = openWorkbenchDatabase({ dataDirectory: root });
    const secretStore = new MemoryCredentialStore();
    const chunks: string[] = [];
    const logger = createLogger(
      { ...testConfig, logLevel: 'info' },
      { write: (chunk: string) => chunks.push(chunk) },
    );
    const sentinel = `secret-scan-${crypto.randomUUID()}`;
    try {
      const response = await request(
        makeApp({
          database: database.connection,
          logger,
          credentialStore: secretStore,
          biliSessionClient: bili,
          browserCredentialAdapter: browser,
        }),
      )
        .put('/api/v1/bili/credential')
        .set('Host', allowedHost)
        .set('Origin', 'http://127.0.0.1:5190')
        .set('X-Workbench-Request', '1')
        .set('Content-Type', 'application/json')
        .send({ sessdata: sentinel });
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain(sentinel);
      expect(chunks.join('')).not.toContain(sentinel);
      database.connection.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      for (const path of filesBelow(root)) {
        expect(readFileSync(path).includes(Buffer.from(sentinel))).toBe(false);
      }
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: false });
    }
  });
});

function filesBelow(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}
