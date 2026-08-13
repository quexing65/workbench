import { existsSync, rmSync } from 'node:fs';
import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { inspectQoderFile } from './qoder-inspector.js';
import { verifyQoderDatabase } from './qoder-safety.js';

type Row = Record<string, SQLInputValue>;

function copyRows(
  source: DatabaseSync,
  destination: DatabaseSync,
  table: string,
  columns: readonly string[],
  where = '',
): void {
  const columnList = columns.join(', ');
  const rows = source
    .prepare(`SELECT ${columnList} FROM ${table}${where} ORDER BY id`)
    .all() as unknown as Row[];
  const insert = destination.prepare(
    `INSERT INTO ${table} (${columnList}) VALUES (${columns.map(() => '?').join(', ')})`,
  );
  for (const row of rows) insert.run(...columns.map((column) => row[column] ?? null));
}

function createSanitizedQoderSnapshotUnchecked(
  sourcePath: string,
  destinationPath: string,
  sourceTimeZone: string,
): { readonly sourceSchema: string; readonly entityCount: number } {
  const source = new DatabaseSync(sourcePath, {
    readOnly: true,
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
  });
  let destination: DatabaseSync | undefined;
  try {
    destination = new DatabaseSync(destinationPath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    const columns = verifyQoderDatabase(source);
    const hasResumePage = columns.bili_videos.has('resume_page');
    const hasResumeSec = columns.bili_videos.has('resume_sec');
    const hasOverride = columns.bili_videos.has('override_at');
    destination.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL,
        task_date TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE bili_series (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE bili_videos (
        id INTEGER PRIMARY KEY, bvid TEXT NOT NULL, title TEXT, cover TEXT, owner TEXT,
        duration INTEGER NOT NULL, pages_json TEXT NOT NULL, series_id INTEGER,
        progress_sec INTEGER NOT NULL, progress_page INTEGER NOT NULL,
        finished INTEGER NOT NULL, last_view_at INTEGER NOT NULL, imported_at TEXT NOT NULL
        ${hasResumePage ? ', resume_page INTEGER NOT NULL' : ''}
        ${hasResumeSec ? ', resume_sec INTEGER NOT NULL' : ''}
        ${hasOverride ? ', override_at INTEGER NOT NULL' : ''},
        FOREIGN KEY (series_id) REFERENCES bili_series(id)
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    `);
    destination.exec('BEGIN IMMEDIATE');
    try {
      copyRows(source, destination, 'tasks', [
        'id',
        'title',
        'note',
        'task_date',
        'status',
        'created_at',
        'completed_at',
      ]);
      copyRows(source, destination, 'notes', ['id', 'content', 'created_at']);
      copyRows(source, destination, 'bili_series', ['id', 'name', 'created_at']);
      copyRows(source, destination, 'bili_videos', [
        'id',
        'bvid',
        'title',
        'cover',
        'owner',
        'duration',
        'pages_json',
        'series_id',
        'progress_sec',
        'progress_page',
        'finished',
        'last_view_at',
        'imported_at',
        ...(hasResumePage ? ['resume_page'] : []),
        ...(hasResumeSec ? ['resume_sec'] : []),
        ...(hasOverride ? ['override_at'] : []),
      ]);
      const browser = source
        .prepare(
          "SELECT key, value FROM settings WHERE key = 'bili_browser' AND value IN ('edge', 'chrome')",
        )
        .get() as Row | undefined;
      if (browser !== undefined) {
        destination
          .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
          .run(browser['key'] ?? null, browser['value'] ?? null);
      }
      destination.exec('COMMIT');
    } catch (error) {
      destination.exec('ROLLBACK');
      throw error;
    }
  } finally {
    destination?.close();
    source.close();
  }

  const inspection = inspectQoderFile(destinationPath, sourceTimeZone);
  if (inspection.fatal.length !== 0 || inspection.credentialsDetected) {
    throw new Error('Sanitized qoder snapshot verification failed');
  }
  return { sourceSchema: inspection.sourceSchema, entityCount: inspection.entities.length };
}

export function createSanitizedQoderSnapshot(
  sourcePath: string,
  destinationPath: string,
  sourceTimeZone: string,
): { readonly sourceSchema: string; readonly entityCount: number } {
  if (existsSync(destinationPath)) throw new Error('Sanitized snapshot destination already exists');
  try {
    return createSanitizedQoderSnapshotUnchecked(sourcePath, destinationPath, sourceTimeZone);
  } catch (error) {
    rmSync(destinationPath, { force: true });
    throw error;
  }
}
