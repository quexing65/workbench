import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

export function verifyPreImportSnapshot(path: string): void {
  const inspection = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  try {
    if (inspection.prepare('PRAGMA integrity_check').get()?.['integrity_check'] !== 'ok') {
      throw new Error('Pre-import snapshot integrity verification failed');
    }
    if (inspection.prepare('PRAGMA foreign_key_check').all().length !== 0) {
      throw new Error('Pre-import snapshot foreign key verification failed');
    }
    if (
      inspection.prepare("SELECT value FROM app_meta WHERE key = 'app_id'").get()?.['value'] !==
      'personal-workbench-vnext'
    ) {
      throw new Error('Pre-import snapshot application identity verification failed');
    }
  } finally {
    inspection.close();
  }
}

export async function createPreImportSnapshot(
  database: DatabaseSync,
  backupDirectory: string,
  runId: string,
): Promise<string> {
  mkdirSync(backupDirectory, { recursive: true });
  const path = join(backupDirectory, `pre-import-${runId}.sqlite`);
  await backup(database, path, { rate: 100 });
  verifyPreImportSnapshot(path);
  return path;
}
