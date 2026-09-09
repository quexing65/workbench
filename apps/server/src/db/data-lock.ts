import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

interface LockRecord {
  readonly pid: number;
  readonly owner: 'server' | 'restore' | 'migrate';
  readonly createdAt: string;
}

export interface DataDirectoryLock {
  readonly path: string;
  release(): void;
}

/**
 * 无法解析的锁文件不可能是有效持有者（多为写入期间崩溃的产物）。给一个宽限期后
 * 自动判定为陈旧并接管，避免用户必须手工删除 `.workbench.lock`；宽限期内仍拒绝，
 * 以覆盖「另一个进程刚创建、内容尚未写完」的瞬时窗口。
 */
const MALFORMED_LOCK_GRACE_MS = 30_000;

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLockRecord(path: string): Partial<LockRecord> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Partial<LockRecord>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stale(path: string): boolean {
  const record = readLockRecord(path);
  if (record === undefined) {
    try {
      return Date.now() - statSync(path).mtimeMs > MALFORMED_LOCK_GRACE_MS;
    } catch {
      // 读失败后又 stat 失败：文件状态不可信，允许接管。
      return true;
    }
  }
  return !Number.isSafeInteger(record.pid) || !processExists(Number(record.pid));
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
        if (released) return;
        released = true;
        // 只在锁仍属于自己时删除：避免删掉接管者（或外部重建）的锁。
        const current = readLockRecord(path);
        if (current?.pid === process.pid && current.owner === owner) rmSync(path, { force: true });
      },
    };
  }
  throw new Error('Workbench data directory lock could not be acquired');
}
