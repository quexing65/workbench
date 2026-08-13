import type { DatabaseSync } from 'node:sqlite';

export const QODER_TABLE_COLUMNS = {
  tasks: ['id', 'title', 'note', 'task_date', 'status', 'created_at', 'completed_at'],
  notes: ['id', 'content', 'created_at'],
  bili_series: ['id', 'name', 'created_at'],
  bili_videos: [
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
  ],
  settings: ['key', 'value'],
} as const;

type Row = Record<string, unknown>;
export type QoderTable = keyof typeof QODER_TABLE_COLUMNS;

export function knownTableColumns(database: DatabaseSync, table: QoderTable): Set<string> {
  const object = database.prepare('SELECT type FROM sqlite_master WHERE name = ?').get(table) as
    Row | undefined;
  if (object?.['type'] !== 'table') throw new RangeError(`qoder 缺少安全表 ${table}`);
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Row[];
  const columns = new Set(rows.map((row) => String(row['name'])));
  for (const required of QODER_TABLE_COLUMNS[table]) {
    if (!columns.has(required)) throw new RangeError(`qoder 表 ${table} 缺少必要列`);
  }
  return columns;
}
