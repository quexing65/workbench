import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { allowedHost, makeApp } from './test-app.js';

let database: WorkbenchDatabase;
let root: string;

function api() {
  return request(makeApp({ database: database.connection }));
}

function write(method: 'post' | 'patch' | 'put' | 'delete', path: string) {
  return api()
    [method](path)
    .set('Host', allowedHost)
    .set('Origin', 'http://127.0.0.1:5190')
    .set('X-Workbench-Request', '1')
    .set('Content-Type', 'application/json');
}

function read(path: string) {
  return api().get(path).set('Host', allowedHost);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'workbench-business-api-'));
  database = openWorkbenchDatabase({ dataDirectory: root });
});

afterEach(() => {
  database.close();
  rmSync(root, { recursive: true, force: false });
});

describe('daily task API', () => {
  it('creates, edits, completes, restores, reschedules and soft deletes a task', async () => {
    const created = await write('post', '/api/v1/tasks').send({
      title: ' 完成报告 ',
      description: '',
      date: '2026-08-13',
    });
    expect(created.status).toBe(201);
    expect(created.headers['etag']).toBe('"1"');
    expect(created.body).toMatchObject({ title: '完成报告', status: 'active', revision: 1 });

    const id = String(created.body.id);
    const completed = await write('patch', `/api/v1/tasks/${id}`).send({
      revision: 1,
      title: '完成最终报告',
      status: 'completed',
    });
    expect(completed.body).toMatchObject({
      title: '完成最终报告',
      status: 'completed',
      revision: 2,
    });

    const restored = await write('patch', `/api/v1/tasks/${id}`).send({
      revision: 2,
      status: 'active',
      date: '2026-08-14',
    });
    expect(restored.body).toMatchObject({ status: 'active', date: '2026-08-14', revision: 3 });
    expect((await read('/api/v1/tasks?date=2026-08-13')).body.items).toHaveLength(0);
    expect((await read('/api/v1/tasks?date=2026-08-14')).body.items).toHaveLength(1);

    const removed = await write('delete', `/api/v1/tasks/${id}`).set('If-Match', '"3"').send();
    expect(removed.status).toBe(204);
    expect((await read('/api/v1/tasks?date=2026-08-14')).body.items).toHaveLength(0);
  });

  it('returns structured validation errors and atomically rejects a stale revision', async () => {
    const invalid = await write('post', '/api/v1/tasks').send({
      title: ' ',
      date: '2026-02-30',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalid.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'title' })]),
    );

    const created = await write('post', '/api/v1/tasks').send({
      title: '并发任务',
      date: '2026-08-13',
    });
    const id = String(created.body.id);
    const [first, second] = await Promise.all([
      write('patch', `/api/v1/tasks/${id}`).send({ revision: 1, status: 'completed' }),
      write('patch', `/api/v1/tasks/${id}`).send({ revision: 1, status: 'cancelled' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.error).toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(conflict.body.error.details[0].current.revision).toBe(2);
  });

  it('rejects invalid identifiers, missing ETags and missing tasks', async () => {
    expect((await read('/api/v1/tasks?date=not-a-date')).status).toBe(400);
    expect(
      (await write('patch', '/api/v1/tasks/not-a-uuid').send({ revision: 1, status: 'active' }))
        .body.error.code,
    ).toBe('VALIDATION_ERROR');
    const missingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      (await write('patch', `/api/v1/tasks/${missingId}`).send({ revision: 1, status: 'active' }))
        .body.error.code,
    ).toBe('TASK_NOT_FOUND');
    expect((await write('delete', `/api/v1/tasks/${missingId}`).send()).body.error.code).toBe(
      'IF_MATCH_REQUIRED',
    );

    const created = await write('post', '/api/v1/tasks').send({
      title: '删除保护',
      date: '2026-08-13',
    });
    const id = String(created.body.id);
    expect(
      (await write('delete', `/api/v1/tasks/${id}`).set('If-Match', '1').send()).body.error.code,
    ).toBe('IF_MATCH_REQUIRED');
    expect(
      (await write('delete', `/api/v1/tasks/${id}`).set('If-Match', '"2"').send()).status,
    ).toBe(409);
  });
});

describe('recurring task API', () => {
  it('merges daily occurrences without writes and keeps dates independent', async () => {
    const created = await write('post', '/api/v1/recurring-tasks').send({
      title: '每日复盘',
      startDate: '2026-08-13',
      endDate: '2026-08-15',
    });
    const id = String(created.body.id);

    for (const date of ['2026-08-13', '2026-08-14', '2026-08-15']) {
      const result = await read(`/api/v1/tasks?date=${date}`);
      expect(result.body.items).toEqual([
        expect.objectContaining({
          kind: 'recurring',
          templateId: id,
          status: 'active',
          revision: 0,
        }),
      ]);
    }
    await read('/api/v1/tasks?date=2026-08-14');
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM recurring_task_occurrences').get(),
    ).toEqual({ count: 0 });

    const changed = await write('put', `/api/v1/recurring-tasks/${id}/occurrences/2026-08-14`).send(
      { revision: 0, status: 'completed' },
    );
    expect(changed.body).toMatchObject({ status: 'completed', revision: 1 });
    expect((await read('/api/v1/tasks?date=2026-08-13')).body.items[0]).toMatchObject({
      status: 'active',
      revision: 0,
    });
    expect((await read('/api/v1/tasks?date=2026-08-14')).body.items[0]).toMatchObject({
      status: 'completed',
      revision: 1,
    });
    expect((await read('/api/v1/tasks?date=2026-08-16')).body.items).toHaveLength(0);
  });

  it('edits, validates ranges, and soft deletes a template with ETag', async () => {
    const invalid = await write('post', '/api/v1/recurring-tasks').send({
      title: '错误范围',
      startDate: '2026-08-15',
      endDate: '2026-08-13',
    });
    expect(invalid.status).toBe(400);

    const created = await write('post', '/api/v1/recurring-tasks').send({
      title: '早起',
      startDate: '2026-08-13',
    });
    const id = String(created.body.id);
    const updated = await write('patch', `/api/v1/recurring-tasks/${id}`).send({
      revision: 1,
      title: '早起喝水',
      endDate: '2026-08-20',
    });
    expect(updated.body).toMatchObject({ title: '早起喝水', revision: 2 });
    expect(
      await write('delete', `/api/v1/recurring-tasks/${id}`).set('If-Match', '"1"'),
    ).toMatchObject({
      status: 409,
    });
    expect(
      await write('delete', `/api/v1/recurring-tasks/${id}`).set('If-Match', '"2"'),
    ).toMatchObject({ status: 204 });
    expect((await read('/api/v1/recurring-tasks')).body.items).toHaveLength(0);
  });

  it('allows only one first occurrence write for revision zero', async () => {
    const created = await write('post', '/api/v1/recurring-tasks').send({
      title: '并发复盘',
      startDate: '2026-08-13',
    });
    const path = `/api/v1/recurring-tasks/${String(created.body.id)}/occurrences/2026-08-13`;
    const [first, second] = await Promise.all([
      write('put', path).send({ revision: 0, status: 'completed' }),
      write('put', path).send({ revision: 0, status: 'cancelled' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  it('validates template updates and occurrence range and revision', async () => {
    const created = await write('post', '/api/v1/recurring-tasks').send({
      title: '范围任务',
      startDate: '2026-08-13',
      endDate: '2026-08-20',
    });
    const id = String(created.body.id);
    const invalidRange = await write('patch', `/api/v1/recurring-tasks/${id}`).send({
      revision: 1,
      startDate: '2026-08-21',
    });
    expect(invalidRange.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });

    const outside = await write('put', `/api/v1/recurring-tasks/${id}/occurrences/2026-08-12`).send(
      { revision: 0, status: 'completed' },
    );
    expect(outside.body.error.code).toBe('OCCURRENCE_NOT_FOUND');
    const missingOverride = await write(
      'put',
      `/api/v1/recurring-tasks/${id}/occurrences/2026-08-13`,
    ).send({ revision: 2, status: 'completed' });
    expect(missingOverride.status).toBe(409);
    const inserted = await write(
      'put',
      `/api/v1/recurring-tasks/${id}/occurrences/2026-08-13`,
    ).send({ revision: 0, status: 'completed' });
    expect(inserted.body.revision).toBe(1);
    const updated = await write('put', `/api/v1/recurring-tasks/${id}/occurrences/2026-08-13`).send(
      { revision: 1, status: 'active' },
    );
    expect(updated.body).toMatchObject({ status: 'active', revision: 2 });
    expect(
      (
        await write('put', `/api/v1/recurring-tasks/${id}/occurrences/2026-08-13`).send({
          revision: 1,
          status: 'cancelled',
        })
      ).status,
    ).toBe(409);
  });
});

describe('notes API', () => {
  it('creates, searches, edits, pins, paginates and deletes notes', async () => {
    const first = await write('post', '/api/v1/notes').send({ content: '第一条 灵感' });
    const second = await write('post', '/api/v1/notes').send({ content: '第二条记录' });
    const id = String(first.body.id);
    const updated = await write('patch', `/api/v1/notes/${id}`).send({
      revision: 1,
      content: '第一条灵感（已整理）',
      pinned: true,
    });
    expect(updated.body).toMatchObject({ pinned: true, revision: 2 });

    const searched = await read('/api/v1/notes?q=%E7%81%B5%E6%84%9F');
    expect(searched.body.items).toEqual([expect.objectContaining({ id, pinned: true })]);
    const page = await read('/api/v1/notes?limit=1');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toEqual(expect.any(String));
    const next = await read(
      `/api/v1/notes?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,
    );
    expect(next.body.items[0].id).toBe(second.body.id);

    expect(await write('delete', `/api/v1/notes/${id}`).set('If-Match', '"2"')).toMatchObject({
      status: 204,
    });
    expect((await read('/api/v1/notes?q=%E7%81%B5%E6%84%9F')).body.items).toHaveLength(0);
  });

  it('rejects empty, oversized and stale updates safely', async () => {
    expect((await write('post', '/api/v1/notes').send({ content: ' ' })).status).toBe(400);
    expect(
      (await write('post', '/api/v1/notes').send({ content: 'x'.repeat(20_001) })).status,
    ).toBe(400);
    const created = await write('post', '/api/v1/notes').send({ content: '原内容' });
    const id = String(created.body.id);
    await write('patch', `/api/v1/notes/${id}`).send({ revision: 1, pinned: true });
    const stale = await write('patch', `/api/v1/notes/${id}`).send({
      revision: 1,
      content: '旧页面内容',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details[0].current.content).toBe('原内容');
  });

  it('filters by pinned and rejects malformed cursors and ETags', async () => {
    const pinned = await write('post', '/api/v1/notes').send({ content: '置顶内容', pinned: true });
    await write('post', '/api/v1/notes').send({ content: '普通内容' });
    expect((await read('/api/v1/notes?pinned=true')).body.items).toEqual([
      expect.objectContaining({ id: pinned.body.id, pinned: true }),
    ]);
    expect((await read('/api/v1/notes?pinned=false')).body.items).toHaveLength(1);
    expect((await read('/api/v1/notes?cursor=broken')).body.error.code).toBe('VALIDATION_ERROR');
    const missingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect(
      (await write('patch', `/api/v1/notes/${missingId}`).send({ revision: 1, pinned: true })).body
        .error.code,
    ).toBe('NOTE_NOT_FOUND');
    expect(
      (await write('delete', `/api/v1/notes/${String(pinned.body.id)}`).set('If-Match', '"2"'))
        .status,
    ).toBe(409);
  });
});
