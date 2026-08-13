import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NormalizedBiliUrl } from '@workbench/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BiliHistoryObservation,
  BiliSessionClient,
} from '../src/modules/bili/session-client.js';
import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import type { BrowserCredentialAdapter } from '../src/modules/credentials/cdp-adapter.js';
import { MemoryCredentialStore } from '../src/modules/credentials/store.js';
import { ExternalServiceError } from '../src/modules/domain-errors.js';
import type { BiliClient, BiliVideoMetadata } from '../src/modules/learning/bili-client.js';
import { LearningResourceRepository } from '../src/modules/learning/resource-repository.js';
import { allowedHost, makeApp } from './test-app.js';

let database: WorkbenchDatabase;
let root: string;
let store: MemoryCredentialStore;
let session: BiliSessionClient;
let metadata: BiliVideoMetadata;

const browser: BrowserCredentialAdapter = { fetch: vi.fn() };
const publicBili: BiliClient = {
  resolveShortUrl: vi.fn(async (): Promise<NormalizedBiliUrl> => ({
    kind: 'video',
    url: 'https://www.bilibili.com/video/BV1ab411c7de/',
    bvid: 'BV1ab411c7de',
    partNumber: 1,
  })),
  getVideo: vi.fn(async () => metadata),
};

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'workbench-sync-'));
  database = openWorkbenchDatabase({ dataDirectory: root });
  store = new MemoryCredentialStore();
  await store.write('sync-test-value');
  metadata = {
    bvid: 'BV1ab411c7de',
    sourceUrl: 'https://www.bilibili.com/video/BV1ab411c7de/',
    title: '同步测试课程',
    coverUrl: null,
    uploaderName: null,
    durationSeconds: 300,
    parts: [
      { cid: 'part-1', partNumber: 1, title: '第一讲', durationSeconds: 100 },
      { cid: 'part-2', partNumber: 2, title: '第二讲', durationSeconds: 200 },
    ],
  };
  new LearningResourceRepository(database.connection).upsertMetadata(
    metadata,
    Date.parse('2026-08-13T00:00:00.000Z'),
    () => crypto.randomUUID(),
  );
  session = { verifyCredential: vi.fn().mockResolvedValue(true), getHistory: vi.fn() };
});

afterEach(() => {
  database.close();
  rmSync(root, { recursive: true, force: false });
});

function createTestApp() {
  return makeApp({
    database: database.connection,
    biliClient: publicBili,
    biliSessionClient: session,
    credentialStore: store,
    browserCredentialAdapter: browser,
  });
}

function start(app: ReturnType<typeof createTestApp>) {
  return request(app)
    .post('/api/v1/learning/sync')
    .set('Host', allowedHost)
    .set('Origin', 'http://127.0.0.1:5190')
    .set('X-Workbench-Request', '1')
    .set('Content-Type', 'application/json')
    .send({ pages: 3 });
}

async function waitForRun(app: ReturnType<typeof createTestApp>, id: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request(app).get(`/api/v1/learning/sync/${id}`).set('Host', allowedHost);
    if (['succeeded', 'failed'].includes(response.body.status as string)) return response;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('sync test did not finish');
}

describe('learning sync API', () => {
  it('allows only one in-process run and applies multi-part history', async () => {
    let release: ((value: readonly BiliHistoryObservation[]) => void) | undefined;
    session.getHistory = vi.fn(
      () => new Promise<readonly BiliHistoryObservation[]>((resolve) => (release = resolve)),
    );
    const app = createTestApp();
    const first = await start(app);
    const second = await start(app);
    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SYNC_ALREADY_RUNNING');
    release?.([
      {
        bvid: metadata.bvid,
        partNumber: 1,
        progressSeconds: 40,
        observedAt: '2026-08-13T01:00:00.000Z',
      },
      {
        bvid: metadata.bvid,
        partNumber: 2,
        progressSeconds: -1,
        observedAt: '2026-08-13T01:01:00.000Z',
      },
    ]);
    const finished = await waitForRun(app, String(first.body.runId));
    expect(finished.body).toMatchObject({
      status: 'succeeded',
      historyCount: 2,
      updatedCount: 2,
      safeErrorCode: null,
    });
    const resource = new LearningResourceRepository(database.connection).list()[0];
    expect(resource?.parts[1]?.progress).toMatchObject({ furthestSeconds: 200, completed: true });
  });

  it('finishes an empty history safely and persists only a safe failure code', async () => {
    session.getHistory = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new ExternalServiceError('BILI_RATE_LIMITED', 'safe message', 429));
    const app = createTestApp();
    const empty = await start(app);
    expect((await waitForRun(app, String(empty.body.runId))).body).toMatchObject({
      status: 'succeeded',
      historyCount: 0,
      updatedCount: 0,
    });
    const failed = await start(app);
    expect((await waitForRun(app, String(failed.body.runId))).body).toMatchObject({
      status: 'failed',
      safeErrorCode: 'BILI_RATE_LIMITED',
    });
  });

  it('keeps furthest progress, moves resume, and blocks old history after reset', async () => {
    session.getHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          bvid: metadata.bvid,
          partNumber: 1,
          progressSeconds: 90,
          observedAt: '2025-08-13T01:00:00.000Z',
        },
        {
          bvid: metadata.bvid,
          partNumber: 1,
          progressSeconds: 20,
          observedAt: '2025-08-13T01:01:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          bvid: metadata.bvid,
          partNumber: 1,
          progressSeconds: 95,
          observedAt: '2025-08-13T01:02:00.000Z',
        },
      ]);
    const app = createTestApp();
    const first = await start(app);
    await waitForRun(app, String(first.body.runId));
    const repository = new LearningResourceRepository(database.connection);
    const progressed = repository.list()[0];
    expect(progressed?.progress).toMatchObject({ furthestSeconds: 90, resumeSeconds: 20 });

    const reset = await request(app)
      .post(`/api/v1/learning/resources/${progressed?.id}/progress/reset`)
      .set('Host', allowedHost)
      .set('Origin', 'http://127.0.0.1:5190')
      .set('X-Workbench-Request', '1')
      .set('Content-Type', 'application/json')
      .send({ revision: progressed?.progress.revision, confirmation: 'reset-learning' });
    expect(reset.status).toBe(200);
    const replay = await start(app);
    expect((await waitForRun(app, String(replay.body.runId))).body.updatedCount).toBe(0);
    expect(repository.list()[0]?.progress).toMatchObject({
      furthestSeconds: 0,
      resumeSeconds: 0,
    });
  });

  it('replays an identical history observation idempotently', async () => {
    const observation = {
      bvid: metadata.bvid,
      partNumber: 1,
      progressSeconds: 35,
      observedAt: '2026-08-13T03:00:00.000Z',
    } as const;
    session.getHistory = vi.fn().mockResolvedValue([observation]);
    const app = createTestApp();
    const first = await start(app);
    expect((await waitForRun(app, String(first.body.runId))).body.updatedCount).toBe(1);
    const second = await start(app);
    expect((await waitForRun(app, String(second.body.runId))).body).toMatchObject({
      status: 'succeeded',
      updatedCount: 0,
    });
  });

  it('marks abandoned queued and running rows failed when the service starts', () => {
    const insert = database.connection.prepare(
      `INSERT INTO sync_runs (id, provider, status, requested_pages, created_at_ms)
       VALUES (?, 'bilibili', ?, 1, ?)`,
    );
    const queued = crypto.randomUUID();
    const running = crypto.randomUUID();
    insert.run(queued, 'queued', 1);
    insert.run(running, 'running', 1);
    createTestApp();
    const rows = database.connection
      .prepare('SELECT status, safe_error_code FROM sync_runs ORDER BY id')
      .all() as Array<{ status: string; safe_error_code: string | null }>;
    expect(rows).toEqual([
      { status: 'failed', safe_error_code: 'SYNC_INTERRUPTED' },
      { status: 'failed', safe_error_code: 'SYNC_INTERRUPTED' },
    ]);
  });

  it('rejects a corrupted stored credential before starting a run', async () => {
    await store.write('bad;stored-cookie');
    const response = await start(createTestApp());
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('BILI_CREDENTIAL_INVALID');
    expect(session.getHistory).not.toHaveBeenCalled();
  });
});
