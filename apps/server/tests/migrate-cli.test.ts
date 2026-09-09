import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireDataDirectoryLock } from '../src/db/data-lock.js';

const roots: string[] = [];
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const tsxCli = join(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');

function migrate(root: string) {
  return spawnSync(process.execPath, [tsxCli, 'apps/server/src/db/cli-migrate.ts'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, LOG_LEVEL: 'silent', WORKBENCH_DATA_DIR: root },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('migration CLI data directory lock', () => {
  it('refuses to migrate while another owner holds the directory, then succeeds and releases', () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-migrate-cli-'));
    roots.push(root);

    const lock = acquireDataDirectoryLock(root, 'server');
    try {
      const blocked = migrate(root);
      expect(blocked.status).not.toBe(0);
      expect(blocked.stderr).toContain('already in use');
    } finally {
      lock.release();
    }

    const migrated = migrate(root);
    expect(migrated.status, migrated.stderr).toBe(0);
    expect(JSON.parse(migrated.stdout)).toMatchObject({ schemaVersion: 5 });
    // CLI 退出后释放锁，后续服务或恢复可以重新取得。
    expect(existsSync(join(root, '.workbench.lock'))).toBe(false);
    const reacquired = acquireDataDirectoryLock(root, 'server');
    reacquired.release();
  }, 30_000);
});
