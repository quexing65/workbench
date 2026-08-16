import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase } from '../src/db/connection.js';
import { BackupService } from '../src/modules/backups/service.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('stopped-service restore CLI', () => {
  it('restores in a separate process without printing absolute paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-restore-cli-'));
    roots.push(root);
    const database = openWorkbenchDatabase({ dataDirectory: root });
    database.connection
      .prepare(
        `
        INSERT INTO tasks (
          id, title, description, task_date, status, created_at_ms, updated_at_ms, revision
        ) VALUES ('before', 'before', '', '2026-08-13', 'active', 1, 1, 1)
      `,
      )
      .run();
    const backup = await new BackupService(
      database.connection,
      database.directories.backups,
    ).create({ persistent: true });
    database.connection
      .prepare(
        `
        INSERT INTO tasks (
          id, title, description, task_date, status, created_at_ms, updated_at_ms, revision
        ) VALUES ('after', 'after', '', '2026-08-13', 'active', 2, 2, 1)
      `,
      )
      .run();
    database.close();

    const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
    const cli = join(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
    const result = spawnSync(
      process.execPath,
      [cli, 'apps/server/src/modules/backups/cli-restore.ts', '--file', backup.path],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, LOG_LEVEL: 'silent', WORKBENCH_DATA_DIR: root },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain(root);
    expect(result.stdout).not.toContain(backup.path);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'restored', schemaVersion: 4 });
    const restored = openWorkbenchDatabase({ dataDirectory: root });
    try {
      expect(restored.connection.prepare('SELECT id FROM tasks ORDER BY id').all()).toEqual([
        { id: 'before' },
      ]);
    } finally {
      restored.close();
    }
  }, 15_000);
});
