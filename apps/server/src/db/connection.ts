import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ensureDataDirectories, type WorkbenchDataDirectories } from './data-directories.js';
import { migrateDatabase, type MigrationResult } from './migrate.js';

export interface DatabasePragmas {
  readonly foreignKeys: number;
  readonly journalMode: string;
  readonly synchronous: number;
  readonly busyTimeout: number;
  readonly tempStore: number;
}

function scalar(database: DatabaseSync, sql: string, field: string): unknown {
  const row = database.prepare(sql).get();
  return row?.[field];
}

export function readDatabasePragmas(database: DatabaseSync): DatabasePragmas {
  return {
    foreignKeys: Number(scalar(database, 'PRAGMA foreign_keys', 'foreign_keys')),
    journalMode: String(scalar(database, 'PRAGMA journal_mode', 'journal_mode')),
    synchronous: Number(scalar(database, 'PRAGMA synchronous', 'synchronous')),
    busyTimeout: Number(scalar(database, 'PRAGMA busy_timeout', 'timeout')),
    tempStore: Number(scalar(database, 'PRAGMA temp_store', 'temp_store')),
  };
}

function configureDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
  `);

  const pragmas = readDatabasePragmas(database);
  if (
    pragmas.foreignKeys !== 1 ||
    pragmas.journalMode.toLowerCase() !== 'wal' ||
    pragmas.synchronous !== 1 ||
    pragmas.busyTimeout !== 5_000 ||
    pragmas.tempStore !== 2
  ) {
    throw new Error('SQLite connection PRAGMA verification failed');
  }
}

export class WorkbenchDatabase {
  public readonly schemaVersion: number;
  public readonly migrations: MigrationResult;
  private closed = false;

  public constructor(
    public readonly connection: DatabaseSync,
    public readonly directories: WorkbenchDataDirectories,
    migrations: MigrationResult,
  ) {
    this.migrations = migrations;
    this.schemaVersion = migrations.schemaVersion;
  }

  public close(): void {
    if (!this.closed) {
      this.connection.close();
      this.closed = true;
    }
  }
}

export interface OpenWorkbenchDatabaseOptions {
  readonly dataDirectory: string;
  readonly migrationDirectory?: string;
}

export function openWorkbenchDatabase(options: OpenWorkbenchDatabaseOptions): WorkbenchDatabase {
  const directories = ensureDataDirectories(options.dataDirectory);
  const database = new DatabaseSync(join(directories.database, 'workbench.sqlite'), {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    timeout: 5_000,
  });

  try {
    configureDatabase(database);
    const migrations = migrateDatabase(database, options.migrationDirectory);
    return new WorkbenchDatabase(database, directories, migrations);
  } catch (error) {
    database.close();
    throw error;
  }
}
