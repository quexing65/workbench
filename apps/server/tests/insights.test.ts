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

function read(path: string) {
  return api().get(path).set('Host', allowedHost);
}

function write(method: 'post' | 'patch' | 'put', path: string) {
  return api()
    [method](path)
    .set('Host', allowedHost)
    .set('Origin', 'http://127.0.0.1:5190')
    .set('X-Workbench-Request', '1')
    .set('Content-Type', 'application/json');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'workbench-insights-'));
  database = openWorkbenchDatabase({ dataDirectory: root });
});

afterEach(() => {
  database.close();
  rmSync(root, { recursive: true, force: false });
});

async function seedTasks() {
  await write('post', '/api/v1/tasks').send({ title: '逾期任务', date: '2026-08-12' });
  const today = await write('post', '/api/v1/tasks').send({
    title: '今日任务',
    date: '2026-08-13',
  });
  await write('patch', `/api/v1/tasks/${String(today.body.id)}`).send({
    revision: 1,
    status: 'completed',
  });
  const recurring = await write('post', '/api/v1/recurring-tasks').send({
    title: '每日整理',
    startDate: '2026-08-13',
  });
  await write(
    'put',
    `/api/v1/recurring-tasks/${String(recurring.body.id)}/occurrences/2026-08-13`,
  ).send({ revision: 0, status: 'completed' });
}

function seedLearning() {
  const resourceId = '10000000-0000-4000-8000-000000000001';
  const partId = '20000000-0000-4000-8000-000000000001';
  const observedAt = Date.UTC(2026, 7, 13, 4);
  database.connection
    .prepare(
      `INSERT INTO learning_resources
       (id, platform, source_url, title, duration_seconds, created_at_ms, updated_at_ms)
       VALUES (?, 'bilibili', 'https://www.bilibili.com/video/BV1test', '类型系统课程', 900, ?, ?)`,
    )
    .run(resourceId, observedAt, observedAt);
  database.connection
    .prepare(
      `INSERT INTO learning_parts
       (id, resource_id, part_number, title, duration_seconds, created_at_ms, updated_at_ms)
       VALUES (?, ?, 1, '第一讲', 900, ?, ?)`,
    )
    .run(partId, resourceId, observedAt, observedAt);
  database.connection
    .prepare(
      `INSERT INTO learning_resource_progress
       (resource_id, resume_part_id, resume_seconds, last_observed_at_ms, updated_at_ms)
       VALUES (?, ?, 120, ?, ?)`,
    )
    .run(resourceId, partId, observedAt, observedAt);
  database.connection
    .prepare(
      `INSERT INTO learning_part_progress
       (part_id, furthest_seconds, last_observed_at_ms, updated_at_ms)
       VALUES (?, 120, ?, ?)`,
    )
    .run(partId, observedAt, observedAt);
}

describe('overview and review API', () => {
  it('aggregates real workbench state without writes', async () => {
    await seedTasks();
    for (const content of ['第一条', '第二条', '第三条', '最近一条']) {
      await write('post', '/api/v1/notes').send({ content });
    }
    seedLearning();
    const before = database.connection
      .prepare('SELECT count(*) AS count FROM recurring_task_occurrences')
      .get();

    const result = await read('/api/v1/overview?date=2026-08-13');

    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.today).toMatchObject({ planned: 2, active: 0, completed: 2 });
    expect(result.body.overdueTasks).toEqual([
      expect.objectContaining({ title: '逾期任务', date: '2026-08-12' }),
    ]);
    expect(result.body.recentNotes).toHaveLength(3);
    expect(result.body.nextLearning).toMatchObject({
      title: '类型系统课程',
      resumePartTitle: '第一讲',
      resumeSeconds: 120,
    });
    expect(result.body.last7Days).toHaveLength(7);
    expect(result.body.last7Days.at(-1)).toMatchObject({
      date: '2026-08-13',
      planned: 2,
      completed: 2,
      completionRate: 1,
      learningActivities: 1,
    });
    expect(
      database.connection.prepare('SELECT count(*) AS count FROM recurring_task_occurrences').get(),
    ).toEqual(before);
  });

  it('returns truthful null rates and validates review ranges', async () => {
    const empty = await read('/api/v1/overview?date=2026-08-13');
    expect(empty.body.nextLearning).toBeNull();
    expect(
      empty.body.last7Days.every((day: { completionRate: unknown }) => day.completionRate === null),
    ).toBe(true);

    await seedTasks();
    seedLearning();
    const review = await read('/api/v1/review?from=2026-08-12&to=2026-08-14');
    expect(review.status).toBe(200);
    expect(review.body.totals).toEqual({
      planned: 4,
      completed: 2,
      cancelled: 0,
      completionRate: 0.5,
      learningActivities: 1,
    });
    expect(review.body.days).toHaveLength(3);
    expect((await read('/api/v1/review?from=2026-08-14&to=2026-08-12')).status).toBe(400);
    expect((await read('/api/v1/review?from=2025-08-01&to=2026-08-14')).status).toBe(400);
  });
});
