import { DatabaseSync } from 'node:sqlite';

import { BACKUP_APP_ID } from '@workbench/shared';

const FORBIDDEN_SETTING_TOKENS = [
  'authorization',
  'cookie',
  'credential',
  'sessdata',
];

export interface SnapshotInspection {
  readonly schemaVersion: number;
}

function schemaVersion(database: DatabaseSync): number {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(id, 1, 4) AS INTEGER)), 0) AS version
       FROM schema_migrations`,
    )
    .get();
  return Number(row?.['version']);
}

function assertNoStoredSecrets(database: DatabaseSync): void {
  const keys = database.prepare('SELECT lower(key) AS key FROM settings').all();
  if (
    keys.some((row) =>
      FORBIDDEN_SETTING_TOKENS.some((token) => String(row['key']).includes(token)),
    )
  ) {
    throw new Error('Business database contains a forbidden credential setting');
  }
}

export function inspectSnapshot(path: string, checkSecrets = true): SnapshotInspection {
  const database = new DatabaseSync(path, {
    readOnly: true,
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
  });
  try {
    database.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF; PRAGMA foreign_keys = ON;');
    if (database.prepare('PRAGMA integrity_check').get()?.['integrity_check'] !== 'ok') {
      throw new Error('Snapshot integrity verification failed');
    }
    if (database.prepare('PRAGMA foreign_key_check').all().length !== 0) {
      throw new Error('Snapshot foreign key verification failed');
    }
    const app = database
      .prepare("SELECT value FROM app_meta WHERE key = 'app_id'")
      .get()?.['value'];
    if (app !== BACKUP_APP_ID) throw new Error('Snapshot application identity verification failed');
    if (checkSecrets) assertNoStoredSecrets(database);
    const version = schemaVersion(database);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error('Snapshot schema version verification failed');
    }
    return { schemaVersion: version };
  } finally {
    database.close();
  }
}
