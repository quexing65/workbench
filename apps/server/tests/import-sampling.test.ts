import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { ImportService } from '../src/modules/imports/import-service.js';
import {
  createQoderFixture,
  personalFixture,
  PERSONAL_BVID,
  writePersonalFile,
} from './import-fixtures.js';

const fixtures: { root: string; database: WorkbenchDatabase }[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'workbench-import-sampling-'));
  const database = openWorkbenchDatabase({ dataDirectory: root });
  const value = {
    root,
    database,
    service: new ImportService(
      database.connection,
      database.directories.imports,
      database.directories.backups,
      () => Date.parse('2026-08-13T12:00:00.000Z'),
      randomUUID,
    ),
  };
  fixtures.push(value);
  return value;
}

function upload(root: string, name: string): string {
  const path = join(root, 'uploads', name);
  mkdirSync(path, { recursive: true });
  return path;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    value.database.close();
    rmSync(value.root, { recursive: true, force: false });
  }
});

describe('import reconciliation sampling', () => {
  it('audits ten tasks, ten notes, fixed boundaries, every multi-part and status edge', async () => {
    const current = fixture();
    const data = personalFixture(3) as {
      tasks: Record<string, unknown>[];
      notes: Record<string, unknown>[];
      fixedTasks: Record<string, unknown>[];
      fixedTaskDays: Record<string, unknown>[];
      studyItems: Record<string, unknown>[];
    };
    data.tasks = Array.from({ length: 10 }, (_, index) => ({
      id: `sample-task-${index}`,
      title: `抽样任务 ${index}`,
      date: '2026-08-13',
      status: index === 0 ? 'completed' : index === 1 ? 'cancelled' : 'active',
      createdAt: '2026-08-10T01:00:00.000Z',
      updatedAt: '2026-08-13T02:00:00.000Z',
      ...(index === 0 ? { completedAt: '2026-08-13T02:00:00.000Z' } : {}),
      ...(index === 1 ? { cancelledAt: '2026-08-13T02:00:00.000Z' } : {}),
    }));
    data.notes = Array.from({ length: 10 }, (_, index) => ({
      id: `sample-note-${index}`,
      content: `抽样小记 ${index}`,
      pinned: index === 0,
      createdAt: '2026-08-11T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }));
    data.fixedTasks = [
      {
        id: 'fixed-open',
        title: '开放边界',
        startDate: '2026-08-01',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
      {
        id: 'fixed-bounded',
        title: '闭合边界',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
    ];
    data.fixedTaskDays = [
      {
        fixedTaskId: 'fixed-open',
        date: '2026-08-01',
        status: 'completed',
        completedAt: '2026-08-01T05:00:00.000Z',
        updatedAt: '2026-08-01T05:00:00.000Z',
      },
      {
        fixedTaskId: 'fixed-bounded',
        date: '2026-08-31',
        status: 'cancelled',
        cancelledAt: '2026-08-31T05:00:00.000Z',
        updatedAt: '2026-08-31T05:00:00.000Z',
      },
    ];
    data.studyItems.unshift({
      id: 'study-first-part',
      title: '同 BV 第一P',
      sourceUrl: `https://www.bilibili.com/video/${PERSONAL_BVID}/?p=1`,
      canonicalKey: `${PERSONAL_BVID}:p1`,
      status: 'learning',
      lastPositionSec: 12,
      lastOpenedAt: '2026-08-12T02:00:00.000Z',
      createdAt: '2026-08-01T01:00:00.000Z',
      updatedAt: '2026-08-12T02:00:00.000Z',
    });
    const preview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(upload(current.root, 'personal'), data),
    });
    await current.service.apply(preview.report.runId, preview.confirmationToken!);

    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM tasks').get(),
    ).toEqual({
      count: 10,
    });
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM notes').get(),
    ).toEqual({
      count: 10,
    });
    expect(
      current.database.connection
        .prepare('SELECT title, start_date, end_date FROM recurring_task_templates ORDER BY title')
        .all(),
    ).toEqual([
      { title: '开放边界', start_date: '2026-08-01', end_date: null },
      { title: '闭合边界', start_date: '2026-08-01', end_date: '2026-08-31' },
    ]);
    expect(
      current.database.connection
        .prepare('SELECT status FROM recurring_task_occurrences ORDER BY occurrence_date')
        .all(),
    ).toEqual([{ status: 'completed' }, { status: 'cancelled' }]);
    expect(
      current.database.connection
        .prepare(
          'SELECT count(*) AS count FROM learning_parts WHERE resource_id = (SELECT id FROM learning_resources WHERE external_id = ?)',
        )
        .get(PERSONAL_BVID),
    ).toEqual({ count: 2 });
    expect(
      current.database.connection
        .prepare("SELECT count(*) AS count FROM tasks WHERE status IN ('completed', 'cancelled')")
        .get(),
    ).toEqual({ count: 2 });

    const qoder = fixture();
    const qoderPreview = await qoder.service.preflight({
      sourceType: 'qoder-sqlite',
      sourceTimezone: 'Asia/Shanghai',
      temporaryPath: createQoderFixture(join(upload(qoder.root, 'qoder'), 'qoder.db')),
    });
    await qoder.service.apply(qoderPreview.report.runId, qoderPreview.confirmationToken!);
    expect(
      qoder.database.connection.prepare('SELECT count(*) AS count FROM learning_parts').get(),
    ).toEqual({ count: 2 });
    expect(
      qoder.database.connection
        .prepare('SELECT completed, manual_override_at_ms FROM learning_resource_progress')
        .get(),
    ).toMatchObject({ completed: 1, manual_override_at_ms: 1_765_555_100_000 });

    const reset = fixture();
    const resetPreview = await reset.service.preflight({
      sourceType: 'qoder-sqlite',
      sourceTimezone: 'Asia/Shanghai',
      temporaryPath: createQoderFixture(join(upload(reset.root, 'reset'), 'qoder.db'), {
        finished: false,
        progressSeconds: 0,
        resumeSeconds: 0,
      }),
    });
    await reset.service.apply(resetPreview.report.runId, resetPreview.confirmationToken!);
    expect(
      reset.database.connection
        .prepare(
          'SELECT furthest_seconds, resume_seconds, completed, manual_override_at_ms FROM learning_resource_progress',
        )
        .get(),
    ).toEqual({
      furthest_seconds: 0,
      resume_seconds: 0,
      completed: 0,
      manual_override_at_ms: 1_765_555_100_000,
    });
  });
});
