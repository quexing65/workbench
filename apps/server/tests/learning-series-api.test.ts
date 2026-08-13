import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NormalizedBiliUrl } from '@workbench/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
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
  root = mkdtempSync(join(tmpdir(), 'workbench-learning-series-api-'));
  database = openWorkbenchDatabase({ dataDirectory: root });
  metadata = {
    bvid: 'BV1ab411c7de',
    sourceUrl: 'https://www.bilibili.com/video/BV1ab411c7de/',
    title: '测试课程',
    coverUrl: null,
    uploaderName: '脱敏讲师',
    durationSeconds: 300,
    parts: [{ cid: 'cid-a', partNumber: 1, title: '第一讲', durationSeconds: 300 }],
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

describe('learning series API', () => {
  it('creates, edits, orders resources and soft deletes a series', async () => {
    const resource = (await importResource()).body.resource;
    const created = await write('post', '/api/v1/learning/series').send({ name: ' 前端课程 ' });
    expect(created.body).toMatchObject({ name: '前端课程', revision: 1 });
    const id = String(created.body.id);
    const renamed = await write('patch', `/api/v1/learning/series/${id}`).send({
      revision: 1,
      name: '类型系统',
    });
    expect(renamed.body).toMatchObject({ name: '类型系统', revision: 2 });
    const ordered = await write('put', `/api/v1/learning/series/${id}/items`).send({
      revision: 2,
      resourceIds: [resource.id],
    });
    expect(ordered.body).toMatchObject({ resourceIds: [resource.id], revision: 3 });
    expect((await read('/api/v1/learning/series')).body.items).toHaveLength(1);
    expect(
      (await write('delete', `/api/v1/learning/series/${id}`).set('If-Match', '"3"')).status,
    ).toBe(204);
    expect((await read('/api/v1/learning/series')).body.items).toHaveLength(0);
  });

  it('rejects duplicate/missing resources, missing series and stale revisions', async () => {
    const resource = (await importResource()).body.resource;
    const series = (await write('post', '/api/v1/learning/series').send({ name: '课程' })).body;
    expect(
      (
        await write('put', `/api/v1/learning/series/${series.id}/items`).send({
          revision: 1,
          resourceIds: [resource.id, resource.id],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await write('put', `/api/v1/learning/series/${series.id}/items`).send({
          revision: 1,
          resourceIds: ['99999999-9999-4999-8999-999999999999'],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await write('patch', `/api/v1/learning/series/${series.id}`).send({
          revision: 2,
          name: '旧页',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await write('post', '/api/v1/learning/resources').send({
          url: metadata.sourceUrl,
          seriesId: '99999999-9999-4999-8999-999999999999',
        })
      ).status,
    ).toBe(404);
  });

  it('reindexes series positions after removing a resource so later appends stay valid', async () => {
    const resources = [];
    for (const [bvid, title] of [
      ['BV1ab411c7de', '第一门'],
      ['BV1xy411c7fg', '第二门'],
      ['BV1mn411c7hi', '第三门'],
    ] as const) {
      metadata = { ...metadata, bvid, title, sourceUrl: `https://www.bilibili.com/video/${bvid}/` };
      resources.push((await importResource(metadata.sourceUrl)).body.resource);
    }
    const created = (await write('post', '/api/v1/learning/series').send({ name: '顺序课程' }))
      .body;
    await write('put', `/api/v1/learning/series/${created.id}/items`).send({
      revision: 1,
      resourceIds: resources.map(({ id }) => id),
    });
    expect(
      (
        await write('delete', `/api/v1/learning/resources/${resources[1].id}`).set(
          'If-Match',
          '"1"',
        )
      ).status,
    ).toBe(204);

    metadata = {
      ...metadata,
      bvid: 'BV1pq411c7jk',
      title: '第四门',
      sourceUrl: 'https://www.bilibili.com/video/BV1pq411c7jk/',
    };
    const appended = await write('post', '/api/v1/learning/resources').send({
      url: metadata.sourceUrl,
      seriesId: created.id,
    });
    expect(appended.status).toBe(201);
    const current = (await read('/api/v1/learning/series')).body.items[0];
    expect(current.resourceIds).toEqual([
      resources[0].id,
      resources[2].id,
      appended.body.resource.id,
    ]);
  });
});
