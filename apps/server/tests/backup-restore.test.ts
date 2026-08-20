import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

import { BACKUP_APP_ID, BACKUP_FORMAT_VERSION, type BackupManifest } from '@workbench/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { acquireDataDirectoryLock } from '../src/db/data-lock.js';
import { logicalDatabaseChecksum } from '../src/db/logical-checksum.js';
import { createBackupArchive, extractBackupArchive } from '../src/modules/backups/archive.js';
import { restoreBackup, type RestoreFaultPoint } from '../src/modules/backups/restore.js';
import { BackupService } from '../src/modules/backups/service.js';
import { inspectSnapshot } from '../src/modules/backups/snapshot.js';

const roots: string[] = [];
const databases: WorkbenchDatabase[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'workbench-backup-'));
  roots.push(value);
  return value;
}

function open(directory = root()): WorkbenchDatabase {
  const database = openWorkbenchDatabase({ dataDirectory: directory });
  databases.push(database);
  return database;
}

function close(database: WorkbenchDatabase): void {
  database.close();
  const index = databases.indexOf(database);
  if (index >= 0) databases.splice(index, 1);
}

function addTask(database: DatabaseSync, id: string, title: string): void {
  database
    .prepare(
      `INSERT INTO tasks (
        id, title, description, task_date, status, created_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, '', '2026-08-13', 'active', 1, 1, 1)`,
    )
    .run(id, title);
}

async function rawArchive(path: string, entries: readonly (readonly [string, Buffer, number?])[]) {
  const zip = new ZipFile();
  for (const [name, content, mode] of entries) {
    zip.addBuffer(content, name, {
      mtime: new Date('2026-08-13T12:00:00.000Z'),
      mode: mode ?? 0o100600,
      compress: true,
    });
  }
  const complete = pipeline(zip.outputStream, createWriteStream(path));
  zip.end();
  await complete;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: false });
});

describe('controlled backup archive', () => {
  it('creates exactly the manifest and consistent database while excluding credentials', async () => {
    const directory = root();
    const database = open(directory);
    addTask(database.connection, 'task-before', '备份前');
    const secret = 'backup-secret-sentinel';
    writeFileSync(join(database.directories.credentials, 'credentials.bin'), secret);
    const expectedChecksum = logicalDatabaseChecksum(database.connection);

    const result = await new BackupService(
      database.connection,
      database.directories.backups,
      () => Date.parse('2026-08-13T12:00:00.000Z'),
      () => '11111111-1111-4111-8111-111111111111',
    ).create({ persistent: true });
    const extracted = await extractBackupArchive(result.path, join(directory, 'extracted'));

    expect(extracted.manifest).toEqual(result.manifest);
    expect(extracted.manifest).toMatchObject({
      app: BACKUP_APP_ID,
      backupFormat: BACKUP_FORMAT_VERSION,
      schemaVersion: 5,
      secretIncluded: false,
    });
    expect(inspectSnapshot(extracted.databasePath)).toEqual({ schemaVersion: 5 });
    const snapshot = new DatabaseSync(extracted.databasePath, { readOnly: true });
    try {
      expect(logicalDatabaseChecksum(snapshot)).toBe(expectedChecksum);
      expect(snapshot.prepare('SELECT title FROM tasks').get()).toEqual({ title: '备份前' });
    } finally {
      snapshot.close();
    }
    expect(readFileSync(result.path).includes(Buffer.from(secret))).toBe(false);
    expect(readdirSync(database.directories.backups)).toEqual([result.fileName]);
  });

  it('refuses to back up a forbidden credential setting and removes temporary output', async () => {
    const database = open();
    database.connection
      .prepare('INSERT INTO settings (key, value_json, updated_at_ms) VALUES (?, ?, ?)')
      .run('my_sessdata_copy', '"secret"', 1);
    await expect(
      new BackupService(database.connection, database.directories.backups).create(),
    ).rejects.toThrow('credential');
    expect(readdirSync(database.directories.backups)).toEqual([]);
  });

  it('compacts deleted sensitive bytes out of the ordinary backup', async () => {
    const database = open();
    const deletedSecret = 'deleted-secret-sentinel-must-not-survive-vacuum';
    database.connection
      .prepare('INSERT INTO settings (key, value_json, updated_at_ms) VALUES (?, ?, ?)')
      .run('temporary_sessdata', JSON.stringify(deletedSecret), 1);
    database.connection.prepare("DELETE FROM settings WHERE key = 'temporary_sessdata'").run();
    const result = await new BackupService(
      database.connection,
      database.directories.backups,
    ).create({ persistent: true });
    const extracted = await extractBackupArchive(
      result.path,
      join(database.directories.root, 'vacuumed'),
    );
    expect(readFileSync(extracted.databasePath).includes(Buffer.from(deletedSecret))).toBe(false);
  });

  const unsafeEntrySets: readonly (readonly [string, Buffer, number?])[][] = [
    [
      ['manifest.json', Buffer.from('{}')],
      ['workbench.sqlite', Buffer.from('db')],
      ['extra.txt', Buffer.from('x')],
    ],
    [
      ['manifest.json', Buffer.from('{}')],
      ['Manifest.json', Buffer.from('{}')],
    ],
    [
      ['manifest.json', Buffer.from('{}')],
      ['workbench.sqlite', Buffer.alloc(1024 * 1024)],
    ],
    [
      ['manifest.json', Buffer.from('{}')],
      ['workbench.sqlite', Buffer.from('target'), 0o120777],
    ],
  ];
  it.each(unsafeEntrySets.map((entries) => [entries] as const))(
    'rejects unsafe archive entry set %#',
    async (entries) => {
      const directory = root();
      const path = join(directory, 'unsafe.pwbk');
      await rawArchive(path, entries);
      await expect(extractBackupArchive(path, join(directory, 'out'))).rejects.toThrow();
      expect(existsSync(join(directory, 'out'))).toBe(false);
    },
  );

  it('rejects a traversal name injected below the ZIP writer safeguards', async () => {
    const directory = root();
    const path = join(directory, 'traversal.pwbk');
    await rawArchive(path, [
      ['manifest.json', Buffer.from('{}')],
      ['workbench.sqlite', Buffer.from('db')],
    ]);
    const bytes = readFileSync(path);
    const safe = Buffer.from('workbench.sqlite');
    const unsafe = Buffer.from('../xbench.sqlite');
    expect(safe.length).toBe(unsafe.length);
    let replacements = 0;
    for (let offset = bytes.indexOf(safe); offset >= 0; offset = bytes.indexOf(safe, offset + 1)) {
      unsafe.copy(bytes, offset);
      replacements += 1;
    }
    expect(replacements).toBe(2);
    writeFileSync(path, bytes);

    await expect(extractBackupArchive(path, join(directory, 'out'))).rejects.toThrow();
    expect(existsSync(join(directory, 'out'))).toBe(false);
  });

  it('cleans extraction staging when the input cannot be opened as ZIP', async () => {
    const directory = root();
    const path = join(directory, 'corrupt.pwbk');
    const output = join(directory, 'out');
    writeFileSync(path, 'not-a-zip');

    await expect(extractBackupArchive(path, output)).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
  });

  it('rejects a manifest whose database size or hash does not match', async () => {
    const directory = root();
    const database = open(directory);
    const snapshotPath = join(directory, 'snapshot.sqlite');
    await import('node:sqlite').then(({ backup }) => backup(database.connection, snapshotPath));
    const manifest: BackupManifest = {
      app: BACKUP_APP_ID,
      backupFormat: BACKUP_FORMAT_VERSION,
      schemaVersion: 5,
      createdAt: '2026-08-13T12:00:00.000Z',
      dbBytes: 1,
      dbSha256: '0'.repeat(64),
      secretIncluded: false,
    };
    const archive = join(directory, 'mismatch.pwbk');
    await createBackupArchive(snapshotPath, manifest, archive);
    await expect(extractBackupArchive(archive, join(directory, 'bad'))).rejects.toThrow(
      'does not match',
    );
  });
});

describe('whole-database restore', () => {
  it('restores the backup logical checksum after later mutations and retains a rollback backup', async () => {
    const directory = root();
    const database = open(directory);
    addTask(database.connection, 'task-before', '备份前');
    const expected = logicalDatabaseChecksum(database.connection);
    const backup = await new BackupService(
      database.connection,
      database.directories.backups,
    ).create({ persistent: true });
    addTask(database.connection, 'task-after', '备份后');
    close(database);

    const restored = await restoreBackup(directory, backup.path);
    expect(restored.restoredLogicalChecksumSha256).toBe(expected);
    expect(restored.beforeLogicalChecksumSha256).not.toBe(expected);
    expect(existsSync(join(directory, 'backups', restored.preRestoreFileName))).toBe(true);
    const reopened = open(directory);
    expect(reopened.connection.prepare('SELECT id FROM tasks ORDER BY id').all()).toEqual([
      { id: 'task-before' },
    ]);
  });

  it.each([
    'after-validation',
    'after-pre-restore-backup',
    'after-active-moved',
    'after-replacement',
    'after-reopen',
  ] as const)('rolls back the active database after injected fault %s', async (point) => {
    const directory = root();
    const database = open(directory);
    addTask(database.connection, 'backup-task', '备份内容');
    const backup = await new BackupService(
      database.connection,
      database.directories.backups,
    ).create({ persistent: true });
    addTask(database.connection, 'current-task', '当前内容');
    const currentChecksum = logicalDatabaseChecksum(database.connection);
    close(database);

    await expect(
      restoreBackup(directory, backup.path, {
        injectFault: (candidate: RestoreFaultPoint) => {
          if (candidate === point) throw new Error(`fault:${point}`);
        },
      }),
    ).rejects.toThrow(`fault:${point}`);
    const reopened = open(directory);
    expect(logicalDatabaseChecksum(reopened.connection)).toBe(currentChecksum);
    expect(reopened.connection.prepare('SELECT id FROM tasks ORDER BY id').all()).toEqual([
      { id: 'backup-task' },
      { id: 'current-task' },
    ]);
  });

  it('requires exclusive ownership of the data directory', async () => {
    const directory = root();
    const database = open(directory);
    const backup = await new BackupService(
      database.connection,
      database.directories.backups,
    ).create({ persistent: true });
    close(database);
    const lock = acquireDataDirectoryLock(directory, 'server');
    try {
      await expect(restoreBackup(directory, backup.path)).rejects.toThrow('already in use');
    } finally {
      lock.release();
    }
  });

  it('recovers a stale lock but refuses malformed lock ownership', () => {
    const directory = root();
    writeFileSync(
      join(directory, '.workbench.lock'),
      JSON.stringify({ pid: 2_147_483_647, owner: 'server', createdAt: new Date().toISOString() }),
    );
    const recovered = acquireDataDirectoryLock(directory, 'restore');
    recovered.release();
    writeFileSync(join(directory, '.workbench.lock'), '{malformed');
    expect(() => acquireDataDirectoryLock(directory, 'restore')).toThrow('already in use');
  });
});
