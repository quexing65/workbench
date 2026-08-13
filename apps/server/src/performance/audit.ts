import { performance } from 'node:perf_hooks';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { InsightRepository } from '../modules/insights/repository.js';
import { LearningResourceReader } from '../modules/learning/resource-reader.js';
import { NoteRepository } from '../modules/notes/repository.js';
import { TaskRepository } from '../modules/tasks/repository.js';
import { withTransaction } from '../db/transaction.js';

export const PERFORMANCE_FIXTURE_COUNTS = {
  tasks: 10_000,
  notes: 10_000,
  learningResources: 1_000,
} as const;

interface PlanRow {
  detail: string;
}

export interface QueryAudit {
  readonly name: string;
  readonly elapsedMs: number;
  readonly resultRows: number;
  readonly plan: readonly string[];
  readonly fullTableScans: readonly string[];
}

export interface PerformanceAuditReport {
  readonly generatedAt: string;
  readonly fixture: typeof PERFORMANCE_FIXTURE_COUNTS;
  readonly sqliteVersion: string;
  readonly fixtureBuildMs: number;
  readonly queries: readonly QueryAudit[];
  readonly passed: boolean;
}

function dateAt(index: number): string {
  const date = new Date(Date.UTC(2025, 0, 1 + (index % 730)));
  return date.toISOString().slice(0, 10);
}

export function populatePerformanceFixture(database: DatabaseSync): number {
  const started = performance.now();
  withTransaction(database, () => {
    const task = database.prepare(`
      INSERT INTO tasks (
        id, title, description, task_date, status, completed_at_ms, cancelled_at_ms,
        created_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 1)
    `);
    for (let index = 0; index < PERFORMANCE_FIXTURE_COUNTS.tasks; index += 1) {
      const status = index % 5 === 0 ? 'completed' : index % 11 === 0 ? 'cancelled' : 'active';
      const now = 1_700_000_000_000 + index;
      task.run(
        `perf-task-${String(index).padStart(5, '0')}`,
        `Performance task ${index}`,
        dateAt(index),
        status,
        status === 'completed' ? now : null,
        status === 'cancelled' ? now : null,
        now,
        now,
      );
    }

    const note = database.prepare(`
      INSERT INTO notes (id, content, pinned, created_at_ms, updated_at_ms, revision)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    for (let index = 0; index < PERFORMANCE_FIXTURE_COUNTS.notes; index += 1) {
      const now = 1_700_000_000_000 + index;
      note.run(
        `perf-note-${String(index).padStart(5, '0')}`,
        `Performance note ${index}`,
        index % 101 === 0 ? 1 : 0,
        now,
        now,
      );
    }

    const resource = database.prepare(`
      INSERT INTO learning_resources (
        id, platform, external_id, source_url, title, duration_seconds,
        metadata_updated_at_ms, created_at_ms, updated_at_ms, revision
      ) VALUES (?, 'bilibili', ?, ?, ?, 600, ?, ?, ?, 1)
    `);
    const part = database.prepare(`
      INSERT INTO learning_parts (
        id, resource_id, external_part_id, part_number, title, duration_seconds,
        created_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, ?, 1, ?, 600, ?, ?, 1)
    `);
    const resourceProgress = database.prepare(`
      INSERT INTO learning_resource_progress (
        resource_id, furthest_part_id, furthest_seconds, resume_part_id, resume_seconds,
        completed, last_observed_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, 120, ?, 120, ?, ?, ?, 1)
    `);
    const partProgress = database.prepare(`
      INSERT INTO learning_part_progress (
        part_id, furthest_seconds, completed, last_observed_at_ms, updated_at_ms, revision
      ) VALUES (?, 120, ?, ?, ?, 1)
    `);
    for (let index = 0; index < PERFORMANCE_FIXTURE_COUNTS.learningResources; index += 1) {
      const resourceId = `perf-resource-${String(index).padStart(4, '0')}`;
      const partId = `perf-part-${String(index).padStart(4, '0')}`;
      const externalId = `BV${String(index).padStart(10, '0')}`;
      const now = 1_700_000_000_000 + index * 86_400_000;
      const completed = index % 7 === 0 ? 1 : 0;
      resource.run(
        resourceId,
        externalId,
        `https://www.bilibili.com/video/${externalId}`,
        `Performance video ${index}`,
        now,
        now,
        now,
      );
      part.run(partId, resourceId, `cid-${index}`, `Part ${index}`, now, now);
      resourceProgress.run(resourceId, partId, partId, completed, now, now);
      partProgress.run(partId, completed, now, now);
    }
  });
  database.exec('ANALYZE');
  return performance.now() - started;
}

function explain(database: DatabaseSync, sql: string, ...parameters: SQLInputValue[]): string[] {
  return (database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters) as unknown as PlanRow[])
    .map((row) => row.detail)
    .sort();
}

function fullTableScans(plan: readonly string[]): string[] {
  const largeTable =
    /\bSCAN (?:TABLE )?(tasks|notes|learning_resources|learning_resource_progress|learning_part_progress)(?:\s|$)/iu;
  return plan.filter((line) => largeTable.test(line) && !/\bUSING\b/iu.test(line));
}

function audit(name: string, operation: () => number, plan: readonly string[]): QueryAudit {
  const started = performance.now();
  const resultRows = operation();
  return {
    name,
    elapsedMs: performance.now() - started,
    resultRows,
    plan,
    fullTableScans: fullTableScans(plan),
  };
}

export function runPerformanceAudit(
  database: DatabaseSync,
  fixtureBuildMs = 0,
  now: () => Date = () => new Date(),
): PerformanceAuditReport {
  const tasks = new TaskRepository(database);
  const notes = new NoteRepository(database);
  const learning = new LearningResourceReader(database);
  const insights = new InsightRepository(database);
  const queries = [
    audit(
      'tasks-for-day',
      () => tasks.list('2026-08-13').length,
      explain(
        database,
        `SELECT id FROM tasks WHERE task_date = ? AND deleted_at_ms IS NULL
         ORDER BY created_at_ms, id`,
        '2026-08-13',
      ),
    ),
    audit(
      'overdue-active-tasks',
      () => insights.listOverdue('2026-08-13').length,
      explain(
        database,
        `SELECT id FROM tasks WHERE task_date < ? AND status = 'active'
         AND deleted_at_ms IS NULL ORDER BY task_date, created_at_ms, id`,
        '2026-08-13',
      ),
    ),
    audit(
      'notes-page',
      () => notes.list({ limit: 50 }).length,
      explain(
        database,
        `SELECT id FROM notes WHERE deleted_at_ms IS NULL
         ORDER BY pinned DESC, updated_at_ms DESC, id DESC LIMIT ?`,
        51,
      ),
    ),
    audit(
      'recent-notes',
      () => insights.listRecentNotes(3).length,
      explain(
        database,
        `SELECT id FROM notes WHERE deleted_at_ms IS NULL
         ORDER BY updated_at_ms DESC, id DESC LIMIT ?`,
        3,
      ),
    ),
    audit(
      'learning-library',
      () => learning.list().length,
      explain(
        database,
        `SELECT id FROM learning_resources WHERE deleted_at_ms IS NULL
         ORDER BY updated_at_ms DESC, id`,
      ),
    ),
    audit(
      'next-learning',
      () => (insights.nextLearning() === null ? 0 : 1),
      explain(
        database,
        `WITH next_progress AS (
           SELECT resource_id, resume_part_id, resume_seconds
           FROM learning_resource_progress
           WHERE completed = 0 AND resume_part_id IS NOT NULL
           ORDER BY COALESCE(last_observed_at_ms, updated_at_ms) DESC, resource_id LIMIT 1
         )
         SELECT r.id FROM next_progress p
         JOIN learning_resources r ON r.id = p.resource_id
         JOIN learning_parts part ON part.id = p.resume_part_id
         WHERE r.deleted_at_ms IS NULL AND part.deleted_at_ms IS NULL`,
      ),
    ),
    audit(
      'learning-activity-range',
      () => insights.learningActivityCounts('2025-01-01', '2027-12-31').size,
      explain(
        database,
        `SELECT last_observed_at_ms FROM learning_part_progress
         WHERE last_observed_at_ms >= ? AND last_observed_at_ms < ?`,
        1_735_660_800_000,
        1_830_297_600_000,
      ),
    ),
  ];
  const sqlite = database.prepare('SELECT sqlite_version() AS version').get();
  return {
    generatedAt: now().toISOString(),
    fixture: PERFORMANCE_FIXTURE_COUNTS,
    sqliteVersion: String(sqlite?.['version']),
    fixtureBuildMs,
    queries,
    passed: queries.every((query) => query.fullTableScans.length === 0 && query.elapsedMs < 2_000),
  };
}
