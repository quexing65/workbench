import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NormalizedBiliUrl } from '@workbench/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { ExternalServiceError } from '../src/modules/domain-errors.js';
import type { BiliClient, BiliVideoMetadata } from '../src/modules/learning/bili-client.js';
import { allowedHost, makeApp } from './test-app.js';

let database: WorkbenchDatabase;
let root: string;
let metadata: BiliVideoMetadata;
let bili: BiliClient;

function api() {
  return request(makeApp({ database: database.connection, biliClient: bili }));
}

function read(path: string) {
  return api().get(path).set('Host', allowedHost);
}

function write(method: 'post' | 'patch' | 'put' | 'delete', path: string) {
  return api()
    [method](path)
    .set('Host', allowedHost)
    .set('Origin', 'http://127.0.0.1:5190')
    .set('X-Workbench-Request', '1')
    .set('Content-Type', 'application/json');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'workbench-learning-api-'));
  database = openWorkbenchDatabase({ dataDirectory: root });
  metadata = {
    bvid: 'BV1ab411c7de',
    sourceUrl: 'https://www.bilibili.com/video/BV1ab411c7de/',
    title: '测试课程',
    coverUrl: null,
    uploaderName: '脱敏讲师',
    durationSeconds: 300,
    parts: [
      { cid: 'cid-a', partNumber: 1, title: '第一讲', durationSeconds: 100 },
      { cid: 'cid-b', partNumber: 2, title: '第二讲', durationSeconds: 200 },
    ],
  };
  bili = {
    resolveShortUrl: vi.fn(async (): Promise<NormalizedBiliUrl> => ({
      kind: 'video',
      url: metadata.sourceUrl,
      bvid: metadata.bvid,
      partNumber: 1,
    })),
    getVideo: vi.fn(async () => metadata),
  };
});

afterEach(() => {
  database.close();
  rmSync(root, { recursive: true, force: false });
});

async function importResource(url = 'https://www.bilibili.com/video/BV1ab411c7de/') {
  return write('post', '/api/v1/learning/resources').send({ url, seriesId: null });
}

describe('learning resource API', () => {
  it('accepts a bare BVID and canonicalizes its source', async () => {
    const result = await importResource('BV1ab411c7de');
    expect(result.status).toBe(201);
    expect(result.body.resource).toMatchObject({
      externalId: 'BV1ab411c7de',
      sourceUrl: 'https://www.bilibili.com/video/BV1ab411c7de/',
    });
  });

  it('imports idempotently and keeps cid identity across page reordering', async () => {
    const first = await importResource();
    expect(first.status).toBe(201);
    expect(
      first.body.resource.parts.map((part: { externalPartId: string }) => part.externalPartId),
    ).toEqual(['cid-a', 'cid-b']);
    const id = String(first.body.resource.id);
    const partIds = new Map<string, string>(
      first.body.resource.parts.map((part: { externalPartId: string; id: string }) => [
        part.externalPartId,
        part.id,
      ]),
    );

    metadata = {
      ...metadata,
      title: '测试课程（更新）',
      parts: [
        { cid: 'cid-b', partNumber: 1, title: '第二讲（前移）', durationSeconds: 200 },
        { cid: 'cid-a', partNumber: 2, title: '第一讲（后移）', durationSeconds: 100 },
      ],
    };
    const second = await importResource();
    expect(second.body.resource.id).toBe(id);
    expect(second.body.resource.title).toBe('测试课程（更新）');
    expect(second.body.resource.parts).toHaveLength(2);
    for (const part of second.body.resource.parts) {
      expect(part.id).toBe(partIds.get(String(part.externalPartId)));
    }
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM learning_resources').get(),
    ).toEqual({ count: 1 });
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM learning_parts').get(),
    ).toEqual({ count: 2 });
  });

  it('observes monotonic furthest, movable resume and clamps duration changes', async () => {
    const resource = (await importResource()).body.resource;
    const partA = resource.parts[0];
    const partB = resource.parts[1];
    const path = `/api/v1/learning/resources/${resource.id}/progress/observe`;
    const forward = await write('post', path).send({
      revision: 1,
      partId: partB.id,
      seconds: 150,
      observedAt: '2026-08-13T12:00:00.000Z',
      source: 'manual',
    });
    expect(forward.body.progress).toMatchObject({
      furthestPartId: partB.id,
      resumePartId: partB.id,
      resumeSeconds: 150,
      revision: 2,
    });
    const replay = await write('post', path).send({
      revision: 2,
      partId: partA.id,
      seconds: 20,
      observedAt: '2026-08-13T13:00:00.000Z',
      source: 'manual',
    });
    expect(replay.body.progress).toMatchObject({
      furthestPartId: partB.id,
      furthestSeconds: 150,
      resumePartId: partA.id,
      resumeSeconds: 20,
      revision: 3,
    });

    metadata = {
      ...metadata,
      durationSeconds: 140,
      parts: [metadata.parts[0]!, { ...metadata.parts[1]!, durationSeconds: 40 }],
    };
    const refreshed = await importResource();
    expect(refreshed.body.resource.progress.furthestSeconds).toBe(40);
  });

  it('clears progress pointers when a previously observed part disappears', async () => {
    const resource = (await importResource()).body.resource;
    const removedPart = resource.parts[1];
    await write('post', `/api/v1/learning/resources/${resource.id}/progress/observe`).send({
      revision: 1,
      partId: removedPart.id,
      seconds: 50,
      observedAt: '2026-08-13T12:00:00.000Z',
      source: 'manual',
    });
    metadata = { ...metadata, parts: [metadata.parts[0]!] };
    const refreshed = await importResource();
    expect(refreshed.body.resource.parts).toHaveLength(1);
    expect(refreshed.body.resource.progress).toMatchObject({
      furthestPartId: null,
      furthestSeconds: 0,
      resumePartId: null,
      resumeSeconds: 0,
    });
  });

  it('requires confirmations and blocks old observations after reset', async () => {
    const resource = (await importResource()).body.resource;
    const base = `/api/v1/learning/resources/${resource.id}/progress`;
    expect((await write('post', `${base}/complete`).send({ revision: 1 })).status).toBe(400);
    const completed = await write('post', `${base}/complete`).send({
      revision: 1,
      confirmation: 'complete-learning',
    });
    expect(completed.body.progress).toMatchObject({ completed: true, revision: 2 });
    const reset = await write('post', `${base}/reset`).send({
      revision: 2,
      confirmation: 'reset-learning',
    });
    expect(reset.body.progress).toMatchObject({
      completed: false,
      resumePartId: null,
      furthestPartId: null,
      revision: 3,
    });
    const old = await write('post', `${base}/observe`).send({
      revision: 3,
      partId: resource.parts[0].id,
      seconds: 80,
      observedAt: '2026-08-13T00:00:00.000Z',
      source: 'sync',
    });
    expect(old.body.progress).toMatchObject({ revision: 3, resumePartId: null });
  });

  it('validates ownership, bounds, conflicts, revisions and soft deletion', async () => {
    const resource = (await importResource()).body.resource;
    const path = `/api/v1/learning/resources/${resource.id}/progress/observe`;
    const base = { revision: 1, observedAt: '2026-08-13T12:00:00.000Z', source: 'manual' };
    expect(
      (
        await write('post', path).send({
          ...base,
          partId: '99999999-9999-4999-8999-999999999999',
          seconds: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (await write('post', path).send({ ...base, partId: resource.parts[0].id, seconds: 101 }))
        .status,
    ).toBe(400);
    await write('post', path).send({ ...base, partId: resource.parts[0].id, seconds: 10 });
    const conflict = await write('post', path).send({
      ...base,
      revision: 2,
      partId: resource.parts[0].id,
      seconds: 11,
    });
    expect(conflict.body.error.code).toBe('OBSERVATION_CONFLICT');
    expect(
      (
        await write('post', path).send({
          ...base,
          partId: resource.parts[0].id,
          seconds: 12,
          observedAt: '2026-08-13T13:00:00.000Z',
        })
      ).status,
    ).toBe(409);
    expect(
      (await write('delete', `/api/v1/learning/resources/${resource.id}`).set('If-Match', '"1"'))
        .status,
    ).toBe(204);
    expect((await read(`/api/v1/learning/resources/${resource.id}`)).status).toBe(404);
  });

  it('retains eligible unresolved b23 failures but never blocked redirects', async () => {
    vi.mocked(bili.resolveShortUrl).mockRejectedValueOnce(
      new ExternalServiceError('BILI_TIMEOUT', '超时', 504),
    );
    const retained = await importResource('https://b23.tv/test');
    expect(retained.status).toBe(202);
    expect(retained.body.kind).toBe('unresolved');
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM unresolved_learning_links').get(),
    ).toEqual({ count: 1 });

    vi.mocked(bili.resolveShortUrl).mockRejectedValueOnce(
      new ExternalServiceError('BILI_REDIRECT_BLOCKED', '阻止'),
    );
    expect((await importResource('https://b23.tv/blocked')).status).toBe(502);
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM unresolved_learning_links').get(),
    ).toEqual({ count: 1 });
  });

  it('keeps task APIs available when Bilibili metadata fails', async () => {
    vi.mocked(bili.getVideo).mockRejectedValueOnce(
      new ExternalServiceError('BILI_UNAVAILABLE', '不可用'),
    );
    expect((await importResource()).body.error.code).toBe('BILI_UNAVAILABLE');
    const task = await write('post', '/api/v1/tasks').send({
      title: '独立任务',
      date: '2026-08-13',
    });
    expect(task.status).toBe(201);
    expect((await read('/api/v1/tasks?date=2026-08-13')).body.items).toHaveLength(1);
  });
});
