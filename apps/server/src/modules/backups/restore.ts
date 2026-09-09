import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { BackupManifest } from '@workbench/shared';

import { openWorkbenchDatabase } from '../../db/connection.js';
import { acquireDataDirectoryLock } from '../../db/data-lock.js';
import { ensureDataDirectories } from '../../db/data-directories.js';
import { logicalDatabaseChecksum } from '../../db/logical-checksum.js';
import { migrateDatabase } from '../../db/migrate.js';
import { BackupService } from './service.js';
import { extractBackupArchive } from './archive.js';
import { inspectSnapshot } from './snapshot.js';

export type RestoreFaultPoint =
  | 'after-validation'
  | 'after-pre-restore-backup'
  | 'after-active-moved'
  | 'after-replacement'
  | 'after-reopen';

export interface RestoreResult {
  readonly sourceFileName: string;
  readonly preRestoreFileName: string;
  readonly manifest: BackupManifest;
  readonly beforeLogicalChecksumSha256: string;
  readonly restoredLogicalChecksumSha256: string;
}

const DATABASE_FILES = ['workbench.sqlite', 'workbench.sqlite-wal', 'workbench.sqlite-shm'] as const;

function checkpoint(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  if (Number(row?.['busy']) !== 0) throw new Error('SQLite checkpoint could not complete');
}

function moveDatabaseSet(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  const moved: (typeof DATABASE_FILES)[number][] = [];
  try {
    for (const name of DATABASE_FILES) {
      const source = join(from, name);
      if (existsSync(source)) {
        renameSync(source, join(to, name));
        moved.push(name);
      }
    }
  } catch (error) {
    for (const name of moved.reverse()) renameSync(join(to, name), join(from, name));
    throw error;
  }
}

function removeDatabaseSet(directory: string): void {
  for (const name of DATABASE_FILES) rmSync(join(directory, name), { force: true });
}

function migrateStagedDatabase(path: string, manifest: BackupManifest): void {
  // 迁移前先核对备份自带的逻辑校验和，证明业务内容与备份时一致。
  const before = inspectSnapshot(path);
  if (before.schemaVersion !== manifest.schemaVersion) {
    throw new Error('Backup manifest schema version does not match the database');
  }
  if (
    manifest.logicalChecksumSha256 !== undefined &&
    before.logicalChecksumSha256 !== manifest.logicalChecksumSha256
  ) {
    throw new Error('Backup logical checksum does not match the staged database');
  }
  const database = new DatabaseSync(path, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
  });
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    migrateDatabase(database);
    checkpoint(database);
  } finally {
    database.close();
  }
  inspectSnapshot(path);
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

export async function restoreBackup(
  dataDirectory: string,
  archivePath: string,
  options: {
    readonly now?: () => number;
    readonly createId?: () => string;
    readonly injectFault?: (point: RestoreFaultPoint) => void;
  } = {},
): Promise<RestoreResult> {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? randomUUID;
  const injectFault = options.injectFault ?? (() => undefined);
  const lock = acquireDataDirectoryLock(dataDirectory, 'restore');
  const directories = ensureDataDirectories(dataDirectory);
  const id = createId();
  const stage = join(directories.database, `.restore-stage-${id}`);
  const rollback = join(directories.database, `.restore-rollback-${id}`);
  const failed = join(directories.backups, `failed-restore-${id}`);
  let activeMoved = false;
  let replacementMoved = false;
  let current: ReturnType<typeof openWorkbenchDatabase> | undefined;

  const attemptRollback = (): unknown => {
    try {
      current?.close();
      current = undefined;
      if (!activeMoved) return undefined;
      if (replacementMoved) {
        mkdirSync(failed, { recursive: true });
        moveDatabaseSet(directories.database, failed);
      } else {
        removeDatabaseSet(directories.database);
      }
      moveDatabaseSet(rollback, directories.database);
      rmSync(rollback, { recursive: true, force: true });
      const verification = openWorkbenchDatabase({ dataDirectory });
      verification.close();
      return undefined;
    } catch (rollbackFailure) {
      return rollbackFailure;
    }
  };

  try {
    const extracted = await extractBackupArchive(archivePath, stage);
    migrateStagedDatabase(extracted.databasePath, extracted.manifest);
    injectFault('after-validation');

    current = openWorkbenchDatabase({ dataDirectory });
    const beforeLogicalChecksumSha256 = logicalDatabaseChecksum(current.connection);
    const preRestore = await new BackupService(
      current.connection,
      directories.backups,
      now,
      createId,
    ).create({ persistent: true });
    checkpoint(current.connection);
    current.close();
    current = undefined;
    injectFault('after-pre-restore-backup');

    moveDatabaseSet(directories.database, rollback);
    activeMoved = true;
    injectFault('after-active-moved');
    renameSync(extracted.databasePath, join(directories.database, 'workbench.sqlite'));
    replacementMoved = true;
    injectFault('after-replacement');

    const restored = openWorkbenchDatabase({ dataDirectory });
    let restoredLogicalChecksumSha256: string;
    try {
      restoredLogicalChecksumSha256 = logicalDatabaseChecksum(restored.connection);
      inspectSnapshot(join(directories.database, 'workbench.sqlite'));
      injectFault('after-reopen');
    } finally {
      restored.close();
    }
    rmSync(rollback, { recursive: true, force: true });
    return {
      sourceFileName: basename(archivePath),
      preRestoreFileName: preRestore.fileName,
      manifest: extracted.manifest,
      beforeLogicalChecksumSha256,
      restoredLogicalChecksumSha256,
    };
  } catch (error) {
    // 回退链自身也可能失败（磁盘、权限、句柄）。此时必须同时暴露两个错误，
    // 否则真正的失败原因会被回退步骤的异常掩盖。
    const rollbackError = attemptRollback();
    if (rollbackError !== undefined) {
      throw new Error('Restore failed and the active database could not be restored', {
        cause: { restoreError: error, rollbackError },
      });
    }
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
    lock.release();
  }
}
