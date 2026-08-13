import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { parseImportCli } from '../src/modules/imports/cli-arguments.js';
import { writeBusinessEntity } from '../src/modules/imports/business-writer.js';
import type { PlannedEntity } from '../src/modules/imports/contracts.js';
import { failedReport } from '../src/modules/imports/import-report.js';
import { ImportService } from '../src/modules/imports/import-service.js';
import { mergeImportedObservation } from '../src/modules/imports/learning-progress-writer.js';
import { writeLearningEntity } from '../src/modules/imports/learning-writer.js';
import { ImportPlanStore } from '../src/modules/imports/plan-store.js';
import { verifyPreImportSnapshot } from '../src/modules/imports/snapshot.js';
import { qoderLocalTimeToEpoch } from '../src/modules/imports/qoder/local-time.js';
import { parseQoderPages } from '../src/modules/imports/qoder/pages-parser.js';
import { inspectQoderFile } from '../src/modules/imports/qoder/qoder-inspector.js';
import { verifyQoderDatabase } from '../src/modules/imports/qoder/qoder-safety.js';
import { knownTableColumns } from '../src/modules/imports/qoder/qoder-schema.js';
import { createQoderFixture, writePersonalFile } from './import-fixtures.js';

const roots: string[] = [];
const databases: WorkbenchDatabase[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'workbench-import-boundaries-'));
  roots.push(value);
  return value;
}

function mutate(path: string, sql: string): string {
  const database = new DatabaseSync(path);
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
  return path;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: false });
});

describe('import input boundaries', () => {
  const invalidCliShapes: readonly (readonly string[])[] = [
    [],
    ['unknown'],
    ['personal'],
    ['personal', '--file'],
    ['personal', '--file', 'a', '--dry-run', '--dry-run'],
    ['personal', '--file', 'a', '--source-timezone', 'UTC'],
    ['qoder', '--file', 'a'],
    ['qoder', '--file', 'a', '--run', 'id', '--source-timezone', 'UTC'],
    ['apply', '--run', 'id', '--file', 'a'],
  ];
  it.each(invalidCliShapes.map((arguments_) => [arguments_] as const))(
    'rejects undocumented CLI shape %#',
    (arguments_) => {
      expect(() => parseImportCli(arguments_)).toThrow();
    },
  );

  it.each([
    ['not-json'],
    ['[]'],
    ['[null]'],
    ['[{"page":0,"cid":1,"part":"P","duration":1}]'],
    ['[{"page":1,"cid":"","part":"P","duration":1}]'],
    ['[{"page":1,"cid":1,"part":"","duration":1}]'],
    ['[{"page":1,"cid":1,"part":"P","duration":1},{"page":1,"cid":2,"part":"P2","duration":1}]'],
    ['[{"page":1,"cid":1,"part":"P","duration":1},{"page":2,"cid":1,"part":"P2","duration":1}]'],
  ])('rejects unsafe pages JSON %#', ([value]) => {
    expect(() => parseQoderPages(value!)).toThrow(RangeError);
  });

  it('rejects oversized pages and invalid, missing or ambiguous local times', () => {
    expect(() => parseQoderPages(' '.repeat(2 * 1024 * 1024 + 1))).toThrow('安全上限');
    expect(() => qoderLocalTimeToEpoch('bad', 'Asia/Shanghai')).toThrow('格式');
    expect(() => qoderLocalTimeToEpoch('2026-03-08 02:30:00', 'America/New_York')).toThrow();
    expect(() => qoderLocalTimeToEpoch('2026-11-01 01:30:00', 'America/New_York')).toThrow();
    expect(() => qoderLocalTimeToEpoch('2026-01-01 00:00:00', 'Invalid/Zone')).toThrow();
  });

  it('builds stable failed reports without leaking source details', () => {
    expect(failedReport('run', 'personal-json', 'abc', 'BAD_SOURCE', '无法读取')).toEqual({
      runId: 'run',
      sourceType: 'personal-json',
      sourceSha256: 'abc',
      sourceSchema: 'unknown',
      mode: 'preflight',
      status: 'failed',
      counts: {},
      conflicts: [],
      warnings: [],
      fatal: [{ code: 'BAD_SOURCE', message: '无法读取' }],
      credentials: { detected: false, migrated: false },
    });
  });
});

describe('qoder hostile-source boundaries', () => {
  it('rejects missing paths and files larger than the hard limit', () => {
    expect(inspectQoderFile(join(root(), 'missing.db'), 'Asia/Shanghai').fatal[0]?.code).toBe(
      'QODER_INSPECTION_FAILED',
    );
    const large = join(root(), 'large.db');
    writeFileSync(large, 'SQLite format 3\0');
    truncateSync(large, 50 * 1024 * 1024 + 1);
    expect(inspectQoderFile(large, 'Asia/Shanghai').fatal[0]?.code).toBe('QODER_FILE_TOO_LARGE');
  });

  it.each([
    "UPDATE tasks SET status='pending', completed_at=NULL",
    "UPDATE tasks SET status='cancelled'",
    'UPDATE tasks SET id=0',
    "UPDATE tasks SET title=''",
    'UPDATE bili_videos SET series_id=NULL, title=NULL, cover=NULL, owner=NULL, last_view_at=0, override_at=0',
    'UPDATE bili_videos SET progress_page=9',
    'UPDATE bili_videos SET resume_page=9',
    "UPDATE bili_videos SET bvid='invalid'",
    'UPDATE bili_videos SET finished=2',
    "UPDATE settings SET value='firefox' WHERE key='bili_browser'",
    "DELETE FROM settings WHERE key='bili_browser'",
    'DROP TABLE notes',
  ])('handles qoder row/schema variant %#', (sql) => {
    const path = mutate(createQoderFixture(join(root(), 'variant.db')), sql);
    const result = inspectQoderFile(path, 'Asia/Shanghai');
    if (
      sql.includes("status='pending'") ||
      sql.includes("status='cancelled'") ||
      sql.includes('series_id=NULL')
    ) {
      expect(result.fatal).toEqual([]);
    } else if (sql.includes("value='firefox'")) {
      expect(result.warnings[0]?.code).toBe('QODER_BROWSER_SETTING_REJECTED');
    } else if (sql.includes('DELETE FROM settings')) {
      expect(result.fatal).toEqual([]);
    } else {
      expect(result.fatal[0]?.code).toBe('QODER_INSPECTION_FAILED');
    }
  });

  it('rejects views, missing columns and mocked integrity/foreign-key/page/row failures', () => {
    const schemaPath = join(root(), 'schema.db');
    const schema = new DatabaseSync(schemaPath);
    try {
      schema.exec('CREATE VIEW tasks AS SELECT 1 AS id');
      expect(() => knownTableColumns(schema, 'tasks')).toThrow('安全表');
      schema.exec('DROP VIEW tasks; CREATE TABLE tasks (id INTEGER)');
      expect(() => knownTableColumns(schema, 'tasks')).toThrow('必要列');
    } finally {
      schema.close();
    }

    function fake(overrides: {
      integrity?: string;
      foreign?: boolean;
      page?: number;
      count?: number;
    }) {
      return {
        exec: () => undefined,
        prepare: (sql: string) => ({
          get: (...parameters: unknown[]) => {
            if (sql === 'PRAGMA integrity_check')
              return { integrity_check: overrides.integrity ?? 'ok' };
            if (sql === 'PRAGMA page_count') return { page_count: overrides.page ?? 1 };
            if (sql === 'PRAGMA page_size') return { page_size: 4096 };
            if (sql.startsWith('SELECT type')) return { type: 'table', name: parameters[0] };
            if (sql.startsWith('SELECT count')) return { count: overrides.count ?? 0 };
            return {};
          },
          all: () => {
            if (sql === 'PRAGMA foreign_key_check') return overrides.foreign ? [{}] : [];
            if (sql.startsWith('PRAGMA table_info')) {
              const table = sql.slice('PRAGMA table_info('.length, -1) as
                'tasks' | 'notes' | 'bili_series' | 'bili_videos' | 'settings';
              const columns = {
                tasks: ['id', 'title', 'note', 'task_date', 'status', 'created_at', 'completed_at'],
                notes: ['id', 'content', 'created_at'],
                bili_series: ['id', 'name', 'created_at'],
                bili_videos: [
                  'id',
                  'bvid',
                  'title',
                  'cover',
                  'owner',
                  'duration',
                  'pages_json',
                  'series_id',
                  'progress_sec',
                  'progress_page',
                  'finished',
                  'last_view_at',
                  'imported_at',
                ],
                settings: ['key', 'value'],
              };
              return columns[table].map((name) => ({ name }));
            }
            return [];
          },
        }),
      } as unknown as DatabaseSync;
    }
    expect(() => verifyQoderDatabase(fake({ integrity: 'bad' }))).toThrow('integrity_check');
    expect(() => verifyQoderDatabase(fake({ foreign: true }))).toThrow('foreign_key_check');
    expect(() => verifyQoderDatabase(fake({ page: 20_000 }))).toThrow('page count');
    expect(() => verifyQoderDatabase(fake({ count: 100_001 }))).toThrow('总行数');
  });
});

describe('plan, report and snapshot boundaries', () => {
  it('rejects malformed occurrence identities and declines entities outside each writer boundary', () => {
    const directory = root();
    const database = openWorkbenchDatabase({ dataDirectory: directory });
    databases.push(database);
    const task: PlannedEntity = {
      sourceKind: 'task',
      sourceId: 'source-task',
      targetKind: 'task',
      sourceHash: 'hash',
      action: 'add',
      targetId: 'target-task',
      baselineTargetHash: null,
      payload: {
        kind: 'task',
        title: '任务',
        description: '',
        date: '2026-08-13',
        status: 'active',
        createdAtMs: 1,
        updatedAtMs: 1,
        completedAtMs: null,
        cancelledAtMs: null,
      },
    };
    const unresolved: PlannedEntity = {
      sourceKind: 'study',
      sourceId: 'source-study',
      targetKind: 'unresolved',
      sourceHash: 'hash',
      action: 'add',
      targetId: 'target-study',
      baselineTargetHash: null,
      payload: {
        kind: 'unresolved',
        normalizedUrl: 'https://b23.tv/test',
        title: '待解析',
        partNumber: 1,
        positionSeconds: 0,
        status: 'learning',
        lastOpenedAtMs: null,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    };
    const invalidOccurrence: PlannedEntity = {
      ...task,
      sourceKind: 'fixed_task_day',
      targetKind: 'occurrence',
      targetId: 'invalid',
      payload: {
        kind: 'occurrence',
        templateSourceId: 'fixed',
        date: '2026-08-13',
        status: 'completed',
        updatedAtMs: 1,
        completedAtMs: 1,
        cancelledAtMs: null,
      },
    };

    expect(writeBusinessEntity(database.connection, unresolved, 1)).toBe(false);
    expect(writeLearningEntity(database.connection, task, 1)).toBe(false);
    expect(() => writeBusinessEntity(database.connection, invalidOccurrence, 1)).toThrow(
      'identity',
    );
  });

  it('rejects invalid and tampered plan identities and ignores unrelated cleanup entries', () => {
    const directory = root();
    const store = new ImportPlanStore(directory);
    expect(() => store.directory('not-a-run')).toThrow('run ID');
    writeFileSync(join(directory, 'keep.txt'), 'keep');
    store.cleanup(new Set());
    expect(() => store.loadConfirmation('11111111-1111-4111-8111-111111111111')).toThrow();
  });

  it('rejects snapshot identity and foreign-key corruption', () => {
    const wrongIdentity = join(root(), 'wrong.sqlite');
    const wrong = new DatabaseSync(wrongIdentity);
    wrong.exec(
      "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_meta VALUES ('app_id','wrong')",
    );
    wrong.close();
    expect(() => verifyPreImportSnapshot(wrongIdentity)).toThrow('identity');

    const brokenForeignKey = join(root(), 'foreign.sqlite');
    const broken = new DatabaseSync(brokenForeignKey);
    broken.exec(
      "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_meta VALUES ('app_id','personal-workbench-vnext'); CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); PRAGMA foreign_keys=OFF; INSERT INTO child VALUES(1)",
    );
    broken.close();
    expect(() => verifyPreImportSnapshot(brokenForeignKey)).toThrow('foreign key');
  });

  it('reports missing imports and makes timezone-less qoder preflight fatal', async () => {
    const directory = root();
    const database = openWorkbenchDatabase({ dataDirectory: directory });
    databases.push(database);
    const service = new ImportService(
      database.connection,
      database.directories.imports,
      database.directories.backups,
    );
    expect(() => service.report('11111111-1111-4111-8111-111111111111')).toThrow('不存在');
    const preview = await service.preflight({
      sourceType: 'qoder-sqlite',
      temporaryPath: writePersonalFile(join(directory, 'upload')),
    });
    expect(preview.report.fatal[0]?.code).toBe('SOURCE_TIMEZONE_REQUIRED');
  });

  it('merges a newer observation into existing completed resource and part progress', () => {
    const directory = root();
    const database = openWorkbenchDatabase({ dataDirectory: directory });
    databases.push(database);
    database.connection
      .prepare(
        `INSERT INTO learning_resources (
          id, platform, external_id, source_url, title, duration_seconds,
          created_at_ms, updated_at_ms, revision
        ) VALUES ('resource', 'bilibili', 'BV1xx411c7mD', 'https://www.bilibili.com/video/BV1xx411c7mD',
          '资源', 100, 1, 1, 1)`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO learning_parts (
          id, resource_id, external_part_id, part_number, title, duration_seconds,
          created_at_ms, updated_at_ms, revision
        ) VALUES ('part', 'resource', 'cid', 1, '分P', 100, 1, 1, 1)`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO learning_resource_progress (
          resource_id, furthest_part_id, furthest_seconds, resume_part_id, resume_seconds,
          completed, completed_at_ms, last_observed_at_ms, manual_override_at_ms,
          updated_at_ms, revision
        ) VALUES ('resource', 'part', 80, 'part', 80, 1, 1000, 1000, 1000, 1000, 1)`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO learning_part_progress (
          part_id, furthest_seconds, completed, completed_at_ms, last_observed_at_ms,
          updated_at_ms, revision
        ) VALUES ('part', 80, 1, 1000, 1000, 1000, 1)`,
      )
      .run();

    mergeImportedObservation(database.connection, 'resource', 'part', 90, 2_000, 2_000);

    expect(
      database.connection
        .prepare(
          'SELECT furthest_seconds, resume_seconds, completed, manual_override_at_ms FROM learning_resource_progress',
        )
        .get(),
    ).toEqual({
      furthest_seconds: 90,
      resume_seconds: 90,
      completed: 1,
      manual_override_at_ms: 1000,
    });
    expect(
      database.connection
        .prepare('SELECT furthest_seconds, completed FROM learning_part_progress')
        .get(),
    ).toEqual({ furthest_seconds: 90, completed: 1 });
  });
});
