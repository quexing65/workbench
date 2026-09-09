import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireDataDirectoryLock } from '../src/db/data-lock.js';

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-data-lock-'));
  roots.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('data directory lock', () => {
  it('refuses a fresh malformed lock but recovers one past the grace period', () => {
    const directory = root();
    const path = join(directory, '.workbench.lock');
    writeFileSync(path, '{malformed');
    expect(() => acquireDataDirectoryLock(directory, 'server')).toThrow('already in use');

    const past = new Date(Date.now() - 60_000);
    utimesSync(path, past, past);
    const recovered = acquireDataDirectoryLock(directory, 'restore');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ owner: 'restore' });

    recovered.release();
    expect(existsSync(path)).toBe(false);
  });

  it('refuses a live owner and never releases a lock taken over by someone else', () => {
    const directory = root();
    const path = join(directory, '.workbench.lock');
    const held = acquireDataDirectoryLock(directory, 'server');
    expect(() => acquireDataDirectoryLock(directory, 'restore')).toThrow('already in use');

    writeFileSync(
      path,
      JSON.stringify({
        pid: process.pid + 1,
        owner: 'migrate',
        createdAt: new Date().toISOString(),
      }),
    );
    held.release();
    expect(existsSync(path)).toBe(true);
  });

  it('recovers a lock whose recorded process is gone', () => {
    const directory = root();
    const path = join(directory, '.workbench.lock');
    writeFileSync(
      path,
      JSON.stringify({ pid: 2_147_483_647, owner: 'server', createdAt: new Date().toISOString() }),
    );
    const recovered = acquireDataDirectoryLock(directory, 'server');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ pid: process.pid });
    recovered.release();
  });
});
