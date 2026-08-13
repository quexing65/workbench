import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase } from '../src/db/connection.js';

const roots: string[] = [];

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

describe('migration transactions', () => {
  it('rolls back all statements from a failed migration', () => {
    const root = temporaryDirectory('workbench-failed-migration-');
    const migrations = temporaryDirectory('workbench-failed-sql-');
    cpSync(fileURLToPath(new URL('../src/db/migrations', import.meta.url)), migrations, {
      recursive: true,
    });
    writeFileSync(
      join(migrations, '0002-failure.sql'),
      'CREATE TABLE should_rollback (id TEXT PRIMARY KEY) STRICT;\nINVALID SQL;',
    );

    expect(() =>
      openWorkbenchDatabase({ dataDirectory: root, migrationDirectory: migrations }),
    ).toThrow();

    const inspection = new DatabaseSync(join(root, 'data', 'workbench.sqlite'), {
      readOnly: true,
    });
    try {
      expect(
        inspection
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='should_rollback'")
          .get(),
      ).toBeUndefined();
      expect(
        inspection.prepare("SELECT 1 FROM schema_migrations WHERE id='0002-failure'").get(),
      ).toBeUndefined();
    } finally {
      inspection.close();
    }
  });
});
