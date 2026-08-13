import { closeSync, openSync, readSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import { knownTableColumns, QODER_TABLE_COLUMNS, type QoderTable } from './qoder-schema.js';

const MAX_QODER_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAGIC = 'SQLite format 3\0';
type Row = Record<string, unknown>;

export function hasSqliteMagic(path: string): boolean {
  const descriptor = openSync(path, 'r');
  try {
    const header = Buffer.alloc(MAGIC.length);
    return (
      readSync(descriptor, header, 0, header.length, 0) === header.length &&
      header.toString('binary') === MAGIC
    );
  } finally {
    closeSync(descriptor);
  }
}

export function verifyQoderDatabase(database: DatabaseSync): Record<QoderTable, Set<string>> {
  database.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
  const integrity = database.prepare('PRAGMA integrity_check').get() as Row | undefined;
  if (integrity?.['integrity_check'] !== 'ok') {
    throw new RangeError('qoder SQLite integrity_check 失败');
  }
  if (database.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new RangeError('qoder SQLite foreign_key_check 失败');
  }
  const pageCount = Number((database.prepare('PRAGMA page_count').get() as Row)['page_count']);
  const pageSize = Number((database.prepare('PRAGMA page_size').get() as Row)['page_size']);
  if (
    !Number.isSafeInteger(pageCount) ||
    !Number.isSafeInteger(pageSize) ||
    pageCount * pageSize > MAX_QODER_BYTES
  ) {
    throw new RangeError('qoder SQLite page count 超过安全上限');
  }
  const tables = Object.keys(QODER_TABLE_COLUMNS) as QoderTable[];
  const columns = Object.fromEntries(
    tables.map((table) => [table, knownTableColumns(database, table)]),
  ) as Record<QoderTable, Set<string>>;
  const counts = tables.map((table) =>
    Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as Row)['count']),
  );
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    counts.reduce((sum, count) => sum + count, 0) > MAX_ROWS
  ) {
    throw new RangeError('qoder 总行数超过安全上限');
  }
  return columns;
}

export const MAX_QODER_FILE_BYTES = MAX_QODER_BYTES;
