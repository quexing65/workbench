import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase, readDatabasePragmas } from '../src/db/connection.js';
import { withTransaction } from '../src/db/transaction.js';

const roots: string[] = [];
const sourceMigrations = fileURLToPath(new URL('../src/db/migrations', import.meta.url));

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: false });
  }
});

describe('Workbench SQLite foundation', () => {
  it('migrates an empty database and verifies PRAGMAs and integrity', () => {
    const root = temporaryDirectory('workbench-database-');
    const database = openWorkbenchDatabase({ dataDirectory: root });

    try {
      expect(database.schemaVersion).toBe(3);
      expect(database.migrations.applied).toEqual([
        '0001-initial',
        '0002-source-contributions',
        '0003-performance-indexes',
      ]);
      expect(readDatabasePragmas(database.connection)).toEqual({
        foreignKeys: 1,
        journalMode: 'wal',
        synchronous: 1,
        busyTimeout: 5_000,
        tempStore: 2,
      });
      expect(database.connection.prepare('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      });
      expect(database.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

      const tables = database.connection
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((row) => row['name']);
      expect(tables).toEqual(
        expect.arrayContaining([
          'app_meta',
          'deletion_markers',
          'import_runs',
          'source_contributions',
          'learning_resources',
          'notes',
          'recurring_task_occurrences',
          'schema_migrations',
          'settings',
          'source_refs',
          'sync_runs',
          'tasks',
        ]),
      );
    } finally {
      database.close();
    }
  });

  it('is idempotent and preserves writes across a restart', () => {
    const root = temporaryDirectory('workbench-restart-');
    const first = openWorkbenchDatabase({ dataDirectory: root });
    first.connection
      .prepare('INSERT INTO settings (key, value_json, updated_at_ms) VALUES (?, ?, ?)')
      .run('theme', '"dark"', 1);
    first.close();

    const second = openWorkbenchDatabase({ dataDirectory: root });
    try {
      expect(second.migrations.applied).toEqual([]);
      expect(
        second.connection.prepare('SELECT value_json FROM settings WHERE key = ?').get('theme'),
      ).toEqual({ value_json: '"dark"' });
    } finally {
      second.close();
    }
  });

  it('rejects a changed applied migration checksum', () => {
    const root = temporaryDirectory('workbench-checksum-');
    const migrations = temporaryDirectory('workbench-migrations-');
    cpSync(sourceMigrations, migrations, { recursive: true });

    const first = openWorkbenchDatabase({ dataDirectory: root, migrationDirectory: migrations });
    first.close();

    const migrationPath = join(migrations, '0001-initial.sql');
    writeFileSync(migrationPath, `${readFileSync(migrationPath, 'utf8')}\n-- changed\n`);
    expect(() =>
      openWorkbenchDatabase({ dataDirectory: root, migrationDirectory: migrations }),
    ).toThrow('checksum mismatch');
  });

  it('rejects unavailable, empty, and incomplete migration directories', () => {
    const missingRoot = temporaryDirectory('workbench-missing-migrations-');
    expect(() =>
      openWorkbenchDatabase({
        dataDirectory: missingRoot,
        migrationDirectory: join(missingRoot, 'missing'),
      }),
    ).toThrow('Migration directory is unavailable');

    const emptyRoot = temporaryDirectory('workbench-empty-migrations-');
    const emptyMigrations = temporaryDirectory('workbench-empty-sql-');
    expect(() =>
      openWorkbenchDatabase({
        dataDirectory: emptyRoot,
        migrationDirectory: emptyMigrations,
      }),
    ).toThrow('No migration files were found');

    const incompleteRoot = temporaryDirectory('workbench-incomplete-migrations-');
    const incompleteMigrations = temporaryDirectory('workbench-incomplete-sql-');
    cpSync(sourceMigrations, incompleteMigrations, { recursive: true });
    const first = openWorkbenchDatabase({
      dataDirectory: incompleteRoot,
      migrationDirectory: incompleteMigrations,
    });
    first.close();
    rmSync(join(incompleteMigrations, '0001-initial.sql'));
    writeFileSync(join(incompleteMigrations, '0002-placeholder.sql'), '-- placeholder\n');
    expect(() =>
      openWorkbenchDatabase({
        dataDirectory: incompleteRoot,
        migrationDirectory: incompleteMigrations,
      }),
    ).toThrow('Applied migration file is missing: 0001-initial');
  });

  it('enforces foreign keys and rolls back failed repository transactions', () => {
    const root = temporaryDirectory('workbench-transaction-');
    const database = openWorkbenchDatabase({ dataDirectory: root });

    try {
      expect(() =>
        database.connection
          .prepare(
            `INSERT INTO recurring_task_occurrences
             (template_id, occurrence_date, status, updated_at_ms)
             VALUES (?, ?, ?, ?)`,
          )
          .run('missing', '2026-08-13', 'active', 1),
      ).toThrow();

      expect(() =>
        withTransaction(database.connection, () => {
          database.connection
            .prepare('INSERT INTO settings (key, value_json, updated_at_ms) VALUES (?, ?, ?)')
            .run('rolled-back', 'true', 1);
          throw new Error('rollback-test');
        }),
      ).toThrow('rollback-test');
      expect(
        database.connection.prepare('SELECT 1 FROM settings WHERE key = ?').get('rolled-back'),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('closes every handle so the temporary data directory can be removed', () => {
    const root = temporaryDirectory('workbench-close-');
    const database = openWorkbenchDatabase({ dataDirectory: root });
    database.close();
    database.close();

    rmSync(root, { recursive: true, force: false });
    roots.splice(roots.indexOf(root), 1);
  });
});
