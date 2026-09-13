import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NormalizedBiliUrl } from '@workbench/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { ExternalServiceError } from '../src/modules/domain-errors.js';
import type { BiliClient, BiliVideoMetadata } from '../src/modules/learning/bili-client.js';
import { LearningResourceRepository } from '../src/modules/learning/resource-repository.js';
import { LearningSeriesRepository } from '../src/modules/learning/series-repository.js';
import { LearningService } from '../src/modules/learning/service.js';
import { allowedHost, makeApp } from './test-app.js';

let database: WorkbenchDatabase;
let root: string;
let metadata: BiliVideoMetadata;
let bili: BiliClient;

function api() {
  return request(makeApp({ database: database.connection, biliClient: bili }));
}

// 观察写入已无 HTTP 入口（手动录入退役，同步走 service 内部调用），
// 行为用例直接装配 service 层驱动。
function makeLearningService(timeZone?: string) {
  return new LearningService(
    new LearningResourceRepository(database.connection, timeZone),
    new LearningSeriesRepository(database.connection),
    bili,
  );
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

async function importResource(
  url = 'https://www.bilibili.com/video/BV1ab411c7de/',
  seriesId: string | null = null,
) {
  return write('post', '/api/v1/learning/resources').send({ url, seriesId });
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

  it('serves resource reads uncacheable so progress changes are never stale', async () => {
    const imported = await importResource();
    const id = String(imported.body.resource.id);
    // 资源 GET 的 ETag 基于 resources.revision，而进度写路径只递增 progress.revision；
    // 禁止缓存以避免 If-None-Match 复验在进度更新后仍返回 304
    const single = await read(`/api/v1/learning/resources/${id}`);
    expect(single.status).toBe(200);
    expect(single.headers['cache-control']).toBe('no-store');
    const list = await read('/api/v1/learning/resources');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
  });

  it('fails atomically when the series is deleted during the metadata fetch', async () => {
    const series = await write('post', '/api/v1/learning/series').send({ name: '竞态系列' });
    const seriesId = String(series.body.id);

    // 在 getVideo 的 await 窗口内发起真实的 DELETE 请求，复现并发删除系列的竞态；
    // 修复前 upsertMetadata 会先行提交，客户端收到 404 但资源已落库
    vi.mocked(bili.getVideo).mockImplementationOnce(async () => {
      await request(makeApp({ database: database.connection, biliClient: bili }))
        .delete(`/api/v1/learning/series/${seriesId}`)
        .set('Host', allowedHost)
        .set('Origin', 'http://127.0.0.1:5190')
        .set('X-Workbench-Request', '1')
        .set('Content-Type', 'application/json')
        .set('If-Match', '"1"');
      return metadata;
    });

    const result = await importResource('https://www.bilibili.com/video/BV1ab411c7de/', seriesId);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('LEARNING_SERIES_NOT_FOUND');
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM learning_resources').get(),
    ).toEqual({ count: 0 });
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM learning_series_items').get(),
    ).toEqual({ count: 0 });

    // 对照：系列未被删除时，同一导入正常写入系列成员
    const survivor = await write('post', '/api/v1/learning/series').send({ name: '存活系列' });
    const ok = await importResource(undefined, String(survivor.body.id));
    expect(ok.status).toBe(201);
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM learning_series_items').get(),
    ).toEqual({ count: 1 });
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

  it('clamps observed progress when a resync shrinks part durations', async () => {
    const service = makeLearningService();
    const imported = await importResource();
    const partB = imported.body.resource.parts[1];
    service.observe(String(imported.body.resource.id), {
      revision: 1,
      partId: partB.id,
      seconds: 150,
      observedAt: '2026-08-13T12:00:00.000Z',
      source: 'sync',
    });

    metadata = {
      ...metadata,
      durationSeconds: 140,
      parts: [metadata.parts[0]!, { ...metadata.parts[1]!, durationSeconds: 40 }],
    };
    const refreshed = await importResource();
    expect(refreshed.body.resource.progress.furthestSeconds).toBe(40);
  });

  it('records watched seconds on the business day of the configured time zone', async () => {
    const imported = await importResource();
    const resourceId = String(imported.body.resource.id);
    const partId = String(imported.body.resource.parts[0].id);
    const observeIn = (timeZone: string, revision: number, observedAt: string, seconds: number) =>
      makeLearningService(timeZone).observe(resourceId, {
        revision,
        partId,
        seconds,
        observedAt,
        source: 'sync',
      });

    // 第一次观察只建立基线，第二次与第三次各贡献 10 秒实际观看。
    await observeIn('Asia/Shanghai', 1, '2026-08-13T20:00:00.000Z', 10);
    await observeIn('Asia/Shanghai', 2, '2026-08-13T20:30:00.000Z', 20);
    await observeIn('America/New_York', 3, '2026-08-13T21:00:00.000Z', 30);

    expect(
      database.connection
        .prepare('SELECT watch_date, watched_seconds FROM learning_watch_daily ORDER BY watch_date')
        .all(),
    ).toEqual([
      { watch_date: '2026-08-13', watched_seconds: 10 },
      { watch_date: '2026-08-14', watched_seconds: 10 },
    ]);
  });

  it('clears progress pointers when a previously observed part disappears', async () => {
    const service = makeLearningService();
    const imported = await importResource();
    const resourceId = String(imported.body.resource.id);
    const removedPart = imported.body.resource.parts[1];
    service.observe(resourceId, {
      revision: 1,
      partId: removedPart.id,
      seconds: 50,
      observedAt: '2026-08-13T12:00:00.000Z',
      source: 'sync',
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

  it('requires explicit confirmations for complete and reset', async () => {
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
  });

  it('soft deletes a resource through If-Match and hides it afterwards', async () => {
    const resource = (await importResource()).body.resource;
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

    // b23.tv 跳转到直播间/动态页时解析器抛 RangeError，应映射为 400 而非 500
    vi.mocked(bili.resolveShortUrl).mockRejectedValueOnce(new RangeError('链接中缺少有效 BVID'));
    const nonVideo = await importResource('https://b23.tv/live-room');
    expect(nonVideo.status).toBe(400);
    expect(nonVideo.body.error.code).toBe('VALIDATION_ERROR');
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

describe('learning resource rename API', () => {
  // 复用模块级 beforeEach/afterEach 的数据库与 B站 mock，仅在用例内替换元数据。

  it('renames with revision guard, clears back to null and survives metadata resync', async () => {
    metadata = {
      bvid: 'BV1ab411c7de',
      sourceUrl: 'https://www.bilibili.com/video/BV1ab411c7de/',
      title: '很长的原始标题',
      coverUrl: null,
      uploaderName: '讲师',
      durationSeconds: 300,
      parts: [{ cid: 'cid-a', partNumber: 1, title: '第一讲', durationSeconds: 300 }],
    };
    const resource = (await importResource()).body.resource;
    const path = `/api/v1/learning/resources/${resource.id}/title`;

    const renamed = await write('patch', path).send({ revision: 1, customTitle: '我的数据库课' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ customTitle: '我的数据库课', title: '很长的原始标题' });
    expect(renamed.body.revision).toBe(2);

    const conflict = await write('patch', path).send({ revision: 1, customTitle: '过期改名' });
    expect(conflict.status).toBe(409);

    const cleared = await write('patch', path).send({ revision: 2, customTitle: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ customTitle: null, revision: 3 });

    // 重新拉取元数据同步标题：原始标题更新，且不触碰已设置的自定义标题
    await write('patch', path).send({ revision: 3, customTitle: '我的数据库课' });
    metadata = { ...metadata, title: '很长的原始标题（第二季）' };
    const resynced = await importResource();
    expect(resynced.body.resource).toMatchObject({
      title: '很长的原始标题（第二季）',
      customTitle: '我的数据库课',
    });
  });

  it('rejects blanks, oversized titles, unknown fields and unknown resources', async () => {
    const resource = (await importResource()).body.resource;
    const path = `/api/v1/learning/resources/${resource.id}/title`;
    expect((await write('patch', path).send({ revision: 1, customTitle: '' })).status).toBe(400);
    expect((await write('patch', path).send({ revision: 1, customTitle: '   ' })).status).toBe(400);
    expect(
      (await write('patch', path).send({ revision: 1, customTitle: 'x'.repeat(501) })).status,
    ).toBe(400);
    expect(
      (await write('patch', path).send({ revision: 1, customTitle: '可以', extra: 1 })).status,
    ).toBe(400);
    expect(
      (
        await write(
          'patch',
          '/api/v1/learning/resources/99999999-9999-4999-8999-999999999999/title',
        ).send({ revision: 1, customTitle: '不存在' })
      ).status,
    ).toBe(404);
  });
});
