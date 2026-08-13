import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase } from '../src/db/connection.js';
import {
  PERFORMANCE_FIXTURE_COUNTS,
  populatePerformanceFixture,
  runPerformanceAudit,
} from '../src/performance/audit.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('performance fixture and query plan audit', () => {
  it('exercises 10k tasks, 10k notes, and 1k videos without obvious full table scans', () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-performance-test-'));
    roots.push(root);
    const database = openWorkbenchDatabase({ dataDirectory: root });
    try {
      const fixtureBuildMs = populatePerformanceFixture(database.connection);
      const report = runPerformanceAudit(
        database.connection,
        fixtureBuildMs,
        () => new Date('2026-08-13T00:00:00.000Z'),
      );
      const counts = Object.fromEntries(
        ['tasks', 'notes', 'learning_resources', 'learning_series'].map((table) => [
          table,
          Number(
            database.connection.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.['count'],
          ),
        ]),
      );

      expect(counts).toEqual({
        tasks: PERFORMANCE_FIXTURE_COUNTS.tasks,
        notes: PERFORMANCE_FIXTURE_COUNTS.notes,
        learning_resources: PERFORMANCE_FIXTURE_COUNTS.learningResources,
        learning_series: PERFORMANCE_FIXTURE_COUNTS.learningSeries,
      });
      expect(report.generatedAt).toBe('2026-08-13T00:00:00.000Z');
      expect(report.queries).toHaveLength(7);
      expect(report.queries.every((query) => query.plan.length > 0)).toBe(true);
      expect(report.queries.flatMap((query) => query.fullTableScans)).toEqual([]);
      expect(report.passed).toBe(true);
      expect(database.connection.prepare('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      });
      expect(database.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  }, 20_000);
});
