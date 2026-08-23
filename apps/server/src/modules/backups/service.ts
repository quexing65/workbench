import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DatabaseSync as SnapshotDatabase } from 'node:sqlite';

import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  type BackupManifest,
} from '@workbench/shared';

import { logicalDatabaseChecksum } from '../../db/logical-checksum.js';
import { hashFile } from '../../db/source-hash.js';
import { createBackupArchive } from './archive.js';
import { inspectSnapshot } from './snapshot.js';

export interface CreatedBackup {
  readonly path: string;
  readonly fileName: string;
  readonly manifest: BackupManifest;
  readonly logicalChecksumSha256: string;
  cleanup(): void;
}

export class BackupService {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly backupDirectory: string,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  public async create(options: { readonly persistent?: boolean } = {}): Promise<CreatedBackup> {
    mkdirSync(this.backupDirectory, { recursive: true });
    const createdAt = new Date(this.now());
    const id = this.createId();
    const workspace = join(this.backupDirectory, `.creating-${id}`);
    mkdirSync(workspace, { recursive: false });
    const snapshotPath = join(workspace, 'workbench.sqlite');
    const stamp = createdAt.toISOString().replaceAll(':', '-');
    const fileName = `personal-workbench-${stamp}-${id.slice(0, 8)}.pwbk`;
    const archivePath = join(
      this.backupDirectory,
      options.persistent ? fileName : `download-${id}.pwbk`,
    );
    try {
      this.database.prepare('VACUUM INTO ?').run(snapshotPath);
      const inspection = inspectSnapshot(snapshotPath);
      const manifest: BackupManifest = {
        app: BACKUP_APP_ID,
        backupFormat: BACKUP_FORMAT_VERSION,
        schemaVersion: inspection.schemaVersion,
        createdAt: createdAt.toISOString(),
        dbBytes: statSync(snapshotPath).size,
        dbSha256: await hashFile(snapshotPath),
        secretIncluded: false,
      };
      const snapshot = new SnapshotDatabase(snapshotPath, {
        readOnly: true,
        allowExtension: false,
        enableDoubleQuotedStringLiterals: false,
      });
      let logicalChecksumSha256: string;
      try {
        logicalChecksumSha256 = logicalDatabaseChecksum(snapshot);
      } finally {
        snapshot.close();
      }
      await createBackupArchive(snapshotPath, manifest, archivePath);
      return {
        path: archivePath,
        fileName,
        manifest,
        logicalChecksumSha256,
        cleanup: () => {
          if (!options.persistent) rmSync(archivePath, { force: true });
        },
      };
    } catch (error) {
      rmSync(archivePath, { force: true });
      throw error;
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
}
