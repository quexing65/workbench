import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface LockRecord {
  readonly pid: number;
  readonly owner: 'server' | 'restore';
  readonly createdAt: string;
}

export interface DataDirectoryLock {
  readonly path: string;
  release(): void;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function stale(path: string): boolean {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockRecord>;
    return !Number.isSafeInteger(record.pid) || !processExists(Number(record.pid));
  } catch {
    return false;
  }
}

export function acquireDataDirectoryLock(
  dataDirectory: string,
  owner: LockRecord['owner'],
): DataDirectoryLock {
  mkdirSync(dataDirectory, { recursive: true });
  const path = join(dataDirectory, '.workbench.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor: number;
    try {
      descriptor = openSync(path, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST' && attempt === 0 && stale(path)) {
        rmSync(path, { force: true });
        continue;
      }
      throw new Error('Workbench data directory is already in use');
    }
    const record: LockRecord = { pid: process.pid, owner, createdAt: new Date().toISOString() };
    try {
      writeFileSync(descriptor, JSON.stringify(record), 'utf8');
    } finally {
      closeSync(descriptor);
    }
    let released = false;
    return {
      path,
      release: () => {
        if (!released) {
          rmSync(path, { force: true });
          released = true;
        }
      },
    };
  }
  throw new Error('Workbench data directory lock could not be acquired');
}
