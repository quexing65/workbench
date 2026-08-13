import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase } from '../src/db/connection.js';
import type { WorkbenchDatabase } from '../src/db/connection.js';
import type { ImportFaultPoint } from '../src/modules/imports/import-applier.js';
import { ImportService } from '../src/modules/imports/import-service.js';
import { hashFile, hashValue, stableJson } from '../src/modules/imports/source-hash.js';
import {
  createQoderFixture,
  personalFixture,
  QODER_BVID,
  TEST_SESSDATA,
  writePersonalFile,
} from './import-fixtures.js';

interface Fixture {
  readonly root: string;
  readonly database: WorkbenchDatabase;
  readonly service: ImportService;
}

const fixtures: Fixture[] = [];

function fixture(injectFault: (point: ImportFaultPoint) => void = () => undefined): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'workbench-import-service-'));
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
      injectFault,
    ),
  };
  fixtures.push(value);
  return value;
}

function uploadDirectory(root: string, name: string): string {
  const value = join(root, 'uploads', name);
  mkdirSync(value, { recursive: true });
  return value;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    value.database.close();
    rmSync(value.root, { recursive: true, force: false });
  }
});

describe('two-phase import service', () => {
  it('preflights, applies and reconciles every Personal v3 entity', async () => {
    const current = fixture();
    const source = writePersonalFile(uploadDirectory(current.root, 'personal'));
    const sourceHash = await hashFile(source);
    const preview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: source,
    });
    expect(preview.report).toMatchObject({
      status: 'ready',
      sourceSha256: sourceHash,
      counts: {
        task: { read: 1, add: 1 },
        fixed_task: { read: 1, add: 1 },
        fixed_task_day: { read: 1, add: 1 },
        note: { read: 1, add: 1 },
        study: { read: 2, add: 2 },
      },
      credentials: { detected: false, migrated: false },
    });
    expect(
      await hashFile(
        join(current.database.directories.imports, preview.report.runId, 'source.bin'),
      ),
    ).toBe(sourceHash);
    const applied = await current.service.apply(preview.report.runId, preview.confirmationToken!);
    expect(applied.status).toBe('succeeded');
    expect(applied.logicalChecksumSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM tasks').get(),
    ).toEqual({ count: 1 });
    expect(
      current.database.connection.prepare('SELECT description, status FROM tasks').get(),
    ).toEqual({ description: '', status: 'completed' });
    expect(
      current.database.connection
        .prepare('SELECT count(*) AS count FROM recurring_task_occurrences')
        .get(),
    ).toEqual({ count: 1 });
    expect(current.database.connection.prepare('SELECT pinned FROM notes').get()).toEqual({
      pinned: 1,
    });
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM learning_resources').get(),
    ).toEqual({ count: 1 });
    expect(
      current.database.connection
        .prepare('SELECT count(*) AS count FROM unresolved_learning_links')
        .get(),
    ).toEqual({ count: 1 });
    expect(current.database.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(Object.values(preview.report.counts).reduce((sum, count) => sum + count.add, 0)).toBe(
      Number(
        current.database.connection.prepare('SELECT count(*) AS count FROM source_refs').get()?.[
          'count'
        ],
      ),
    );
    await expect(
      hashFile(join(current.database.directories.imports, preview.report.runId, 'source.bin')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('imports qoder metadata, series, parts and progress but never the credential', async () => {
    const current = fixture();
    const source = createQoderFixture(join(uploadDirectory(current.root, 'qoder'), 'qoder.db'), {
      secret: true,
    });
    const preview = await current.service.preflight({
      sourceType: 'qoder-sqlite',
      sourceTimezone: 'Asia/Shanghai',
      temporaryPath: source,
    });
    expect(preview.report.credentials).toEqual({ detected: true, migrated: false });
    expect(JSON.stringify(preview)).not.toContain(TEST_SESSDATA);
    await current.service.apply(preview.report.runId, preview.confirmationToken!);
    expect(
      current.database.connection
        .prepare('SELECT title, uploader_name FROM learning_resources')
        .get(),
    ).toEqual({ title: 'qoder 视频', uploader_name: 'UP' });
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM learning_parts').get(),
    ).toEqual({ count: 2 });
    expect(
      current.database.connection
        .prepare('SELECT count(*) AS count FROM learning_series_items')
        .get(),
    ).toEqual({ count: 1 });
    expect(
      current.database.connection
        .prepare("SELECT value_json FROM settings WHERE key='bili_browser'")
        .get(),
    ).toEqual({ value_json: '"edge"' });
    expect(
      current.database.connection.prepare("SELECT 1 FROM settings WHERE key='bili_sessdata'").get(),
    ).toBeUndefined();
    expect(
      JSON.stringify(current.database.connection.prepare('SELECT * FROM import_runs').all()),
    ).not.toContain(TEST_SESSDATA);
  });

  it('makes an identical second import a no-op and keeps local changes on conflict', async () => {
    const current = fixture();
    const firstSource = writePersonalFile(uploadDirectory(current.root, 'first'));
    const first = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: firstSource,
    });
    await current.service.apply(first.report.runId, first.confirmationToken!);

    const secondSource = writePersonalFile(uploadDirectory(current.root, 'second'));
    const second = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: secondSource,
    });
    expect(
      Object.values(second.report.counts).every(({ add, conflict }) => add === 0 && conflict === 0),
    ).toBe(true);
    expect(
      Object.values(second.report.counts).reduce((sum, count) => sum + count.unchanged, 0),
    ).toBe(6);
    await current.service.apply(second.report.runId, second.confirmationToken!);

    const task = current.database.connection.prepare('SELECT id FROM tasks').get()!;
    current.database.connection
      .prepare('UPDATE tasks SET title = ?, revision = revision + 1')
      .run('本地修改');
    const changed = personalFixture(3) as { tasks: { title: string; updatedAt: string }[] };
    changed.tasks[0]!.title = '来源修改';
    changed.tasks[0]!.updatedAt = '2026-08-13T06:00:00.000Z';
    const third = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'third'), changed),
    });
    expect(third.report.counts['task']?.conflict).toBe(1);
    await current.service.apply(third.report.runId, third.confirmationToken!);
    expect(
      current.database.connection
        .prepare('SELECT title FROM tasks WHERE id = ?')
        .get(String(task['id'])),
    ).toEqual({ title: '本地修改' });
  });

  it('reports possible task duplicates and qoder rows missing from a later source', async () => {
    const current = fixture();
    current.database.connection
      .prepare(
        `INSERT INTO tasks (
          id, title, description, task_date, status, created_at_ms, updated_at_ms, revision
        ) VALUES (?, '旧任务', '', '2026-08-13', 'active', 1, 1, 1)`,
      )
      .run(randomUUID());
    const personal = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'possible-duplicate')),
    });
    expect(personal.report.warnings.map(({ code }) => code)).toContain('POSSIBLE_DUPLICATE_TASK');

    const firstQoder = await current.service.preflight({
      sourceType: 'qoder-sqlite',
      sourceTimezone: 'Asia/Shanghai',
      temporaryPath: createQoderFixture(
        join(uploadDirectory(current.root, 'missing-first'), 'qoder.db'),
      ),
    });
    await current.service.apply(firstQoder.report.runId, firstQoder.confirmationToken!);
    const secondPath = createQoderFixture(
      join(uploadDirectory(current.root, 'missing-second'), 'qoder.db'),
    );
    const sourceDatabase = new (await import('node:sqlite')).DatabaseSync(secondPath);
    sourceDatabase.exec('DELETE FROM bili_videos; DELETE FROM bili_series;');
    sourceDatabase.close();
    const secondQoder = await current.service.preflight({
      sourceType: 'qoder-sqlite',
      sourceTimezone: 'Asia/Shanghai',
      temporaryPath: secondPath,
    });
    expect(secondQoder.report.warnings.map(({ code }) => code)).toContain(
      'QODER_MISSING_FROM_SOURCE',
    );
  });

  it('rejects token replay and target changes after preflight', async () => {
    const current = fixture();
    const preview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'replay')),
    });
    await current.service.apply(preview.report.runId, preview.confirmationToken!);
    await expect(
      current.service.apply(preview.report.runId, preview.confirmationToken!),
    ).rejects.toMatchObject({ code: 'IMPORT_CONFIRMATION_INVALID' });

    const next = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'changed')),
    });
    current.database.connection
      .prepare('UPDATE tasks SET title = ?, revision = revision + 1')
      .run('预检后变化');
    await expect(
      current.service.apply(next.report.runId, next.confirmationToken!),
    ).rejects.toMatchObject({ code: 'IMPORT_TARGET_CHANGED' });
  });

  it('binds confirmation to the immutable database plan digest', async () => {
    const current = fixture();
    const preview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'plan-digest')),
    });
    const path = join(current.database.directories.imports, preview.report.runId, 'plan.json');
    const tampered = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const entities = tampered['entities'] as { sourceHash: string }[];
    entities[0]!.sourceHash = '0'.repeat(64);
    tampered['planSha256'] = hashValue(
      Object.fromEntries(Object.entries(tampered).filter(([key]) => key !== 'planSha256')),
    );
    writeFileSync(path, stableJson(tampered));
    await expect(
      current.service.apply(preview.report.runId, preview.confirmationToken!),
    ).rejects.toMatchObject({ code: 'IMPORT_PLAN_CHANGED' });
  });

  it('merges exact cross-source BVID parts and scopes Personal tombstones to its contribution', async () => {
    const current = fixture();
    const personal = personalFixture(3) as {
      studyItems: { id: string; sourceUrl: string; canonicalKey: string }[];
      tombstones: { entity: string; id: string; canonicalKey: string; deletedAt: string }[];
    };
    personal.studyItems[0]!.sourceUrl = `https://www.bilibili.com/video/${QODER_BVID}/?p=2`;
    personal.studyItems[0]!.canonicalKey = `${QODER_BVID}:p2`;
    const personalPreview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'cross-personal'), personal),
    });
    await current.service.apply(personalPreview.report.runId, personalPreview.confirmationToken!);

    const qoderPreview = await current.service.preflight({
      sourceType: 'qoder-sqlite',
      sourceTimezone: 'Asia/Shanghai',
      temporaryPath: createQoderFixture(
        join(uploadDirectory(current.root, 'cross-qoder'), 'qoder.db'),
        { bvid: QODER_BVID },
      ),
    });
    await current.service.apply(qoderPreview.report.runId, qoderPreview.confirmationToken!);
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM learning_resources').get(),
    ).toEqual({ count: 1 });
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM learning_parts').get(),
    ).toEqual({ count: 2 });

    personal.studyItems = personal.studyItems.filter(({ id }) => id !== 'study-old');
    personal.tombstones.push({
      entity: 'study',
      id: 'study-old',
      canonicalKey: `${QODER_BVID}:p2`,
      deletedAt: '2026-08-13T10:00:00.000Z',
    });
    const deletion = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'cross-delete'), personal),
    });
    expect(deletion.report.counts['deletion_marker']).toMatchObject({ read: 1, add: 1 });
    await current.service.apply(deletion.report.runId, deletion.confirmationToken!);
    expect(
      current.database.connection
        .prepare('SELECT external_id, deleted_at_ms FROM learning_resources')
        .get(),
    ).toEqual({ external_id: QODER_BVID, deleted_at_ms: null });
  });

  it('enforces permanent fixed-task tombstones and permits only newer ordinary resurrection', async () => {
    const current = fixture();
    const initial = personalFixture(3) as {
      tasks: { id: string; title: string; updatedAt: string }[];
      fixedTasks: { id: string; title: string; updatedAt: string }[];
      tombstones: { entity: string; id: string; deletedAt: string }[];
    };
    const first = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'tombstone-first'), initial),
    });
    await current.service.apply(first.report.runId, first.confirmationToken!);

    initial.tombstones.push(
      { entity: 'task', id: 'task-old', deletedAt: '2026-08-13T08:00:00.000Z' },
      { entity: 'fixed_task', id: 'fixed-old', deletedAt: '2026-08-13T08:00:00.000Z' },
    );
    const deleted = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'tombstone-delete'), initial),
    });
    await current.service.apply(deleted.report.runId, deleted.confirmationToken!);
    expect(current.database.connection.prepare('SELECT deleted_at_ms FROM tasks').get()).toEqual({
      deleted_at_ms: Date.parse('2026-08-13T12:00:00.000Z'),
    });

    initial.tasks[0]!.title = '墓碑之后的新任务版本';
    initial.tasks[0]!.updatedAt = '2026-08-13T09:00:00.000Z';
    initial.fixedTasks[0]!.title = '固定任务不得复活';
    initial.fixedTasks[0]!.updatedAt = '2026-08-13T09:00:00.000Z';
    const resurrection = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(
        uploadDirectory(current.root, 'tombstone-resurrection'),
        initial,
      ),
    });
    expect(resurrection.report.counts['task']).toMatchObject({ update: 1, conflict: 0 });
    expect(resurrection.report.counts['fixed_task']).toMatchObject({ update: 0, conflict: 1 });
    expect(resurrection.report.counts['fixed_task_day']).toMatchObject({
      update: 0,
      conflict: 1,
    });
    await current.service.apply(resurrection.report.runId, resurrection.confirmationToken!);
    expect(
      current.database.connection.prepare('SELECT title, deleted_at_ms FROM tasks').get(),
    ).toEqual({
      title: '墓碑之后的新任务版本',
      deleted_at_ms: null,
    });
    expect(
      current.database.connection
        .prepare('SELECT title, deleted_at_ms FROM recurring_task_templates')
        .get(),
    ).toEqual({ title: '每日复盘', deleted_at_ms: expect.any(Number) });
  });

  it('records tombstones but keeps locally edited targets as explicit conflicts', async () => {
    const current = fixture();
    const data = personalFixture(3) as {
      tombstones: { entity: string; id: string; deletedAt: string }[];
    };
    const first = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'local-delete-first'), data),
    });
    await current.service.apply(first.report.runId, first.confirmationToken!);
    current.database.connection
      .prepare("UPDATE tasks SET title = '用户本地编辑', revision = revision + 1")
      .run();
    data.tombstones.push({
      entity: 'task',
      id: 'task-old',
      deletedAt: '2026-08-13T08:00:00.000Z',
    });
    const deletion = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'local-delete-next'), data),
    });
    expect(deletion.report.counts['deletion_marker']).toMatchObject({ conflict: 1 });
    expect(deletion.report.conflicts).toContainEqual(
      expect.objectContaining({ code: 'TOMBSTONE_TARGET_CONFLICT', resolution: 'keep-target' }),
    );
    await current.service.apply(deletion.report.runId, deletion.confirmationToken!);
    expect(
      current.database.connection.prepare('SELECT title, deleted_at_ms FROM tasks').get(),
    ).toEqual({
      title: '用户本地编辑',
      deleted_at_ms: null,
    });
    expect(
      current.database.connection.prepare('SELECT count(*) AS count FROM deletion_markers').get(),
    ).toEqual({ count: 1 });
  });

  it('rejects apply when a tombstone target changes after preflight', async () => {
    const current = fixture();
    const data = personalFixture(3) as {
      tombstones: { entity: string; id: string; deletedAt: string }[];
    };
    const first = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'stale-delete-first'), data),
    });
    await current.service.apply(first.report.runId, first.confirmationToken!);
    data.tombstones.push({
      entity: 'task',
      id: 'task-old',
      deletedAt: '2026-08-13T08:00:00.000Z',
    });
    const deletion = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, 'stale-delete-next'), data),
    });
    current.database.connection
      .prepare("UPDATE tasks SET title = '预检后的本地编辑', revision = revision + 1")
      .run();

    await expect(
      current.service.apply(deletion.report.runId, deletion.confirmationToken!),
    ).rejects.toMatchObject({ code: 'IMPORT_TARGET_CHANGED', status: 409 });
    expect(
      current.database.connection.prepare('SELECT title, deleted_at_ms FROM tasks').get(),
    ).toEqual({
      title: '预检后的本地编辑',
      deleted_at_ms: null,
    });
  });

  it.each([
    'after-staging',
    'after-tasks',
    'after-notes',
    'after-series',
    'after-parts',
    'before-commit',
  ] as const)('rolls back all writes at fault point %s', async (point) => {
    const current = fixture((candidate) => {
      if (candidate === point) throw new Error(`fault:${point}`);
    });
    const preview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(uploadDirectory(current.root, point)),
    });
    await expect(
      current.service.apply(preview.report.runId, preview.confirmationToken!),
    ).rejects.toThrow(`fault:${point}`);
    for (const table of [
      'tasks',
      'notes',
      'learning_resources',
      'source_refs',
      'source_contributions',
    ]) {
      expect(
        current.database.connection.prepare(`SELECT count(*) AS count FROM ${table}`).get(),
      ).toEqual({ count: 0 });
    }
    expect(
      current.database.connection
        .prepare("SELECT count(*) AS count FROM import_runs WHERE mode='apply'")
        .get(),
    ).toEqual({ count: 0 });
  });
});
