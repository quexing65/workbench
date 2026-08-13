import type { DatabaseSync } from 'node:sqlite';

import { hashValue } from './source-hash.js';

type Row = Record<string, unknown>;

const PROJECTIONS: Record<string, { table: string; columns: string }> = {
  task: {
    table: 'tasks',
    columns:
      'title, description, task_date, status, completed_at_ms, cancelled_at_ms, created_at_ms, updated_at_ms, deleted_at_ms',
  },
  recurring: {
    table: 'recurring_task_templates',
    columns: 'title, start_date, end_date, created_at_ms, updated_at_ms, deleted_at_ms',
  },
  note: {
    table: 'notes',
    columns: 'content, pinned, created_at_ms, updated_at_ms, deleted_at_ms',
  },
  learning: {
    table: 'learning_resources',
    columns: 'external_id, deleted_at_ms',
  },
  unresolved: {
    table: 'unresolved_learning_links',
    columns:
      'normalized_url, title, requested_part_number, position_seconds, status, last_opened_at_ms, deleted_at_ms',
  },
  series: {
    table: 'learning_series',
    columns: 'name, created_at_ms, updated_at_ms, deleted_at_ms',
  },
};

export interface SourceReference {
  readonly targetKind: string;
  readonly targetId: string;
  readonly lastSourceHash: string;
  readonly lastTargetHash: string;
}

export function sourceReference(
  database: DatabaseSync,
  sourceSystem: string,
  sourceKind: string,
  sourceId: string,
): SourceReference | undefined {
  const row = database
    .prepare(
      `SELECT target_kind, target_id, last_source_hash, last_imported_target_hash
       FROM source_refs WHERE source_system = ? AND source_kind = ? AND source_id = ?`,
    )
    .get(sourceSystem, sourceKind, sourceId) as Row | undefined;
  return row === undefined
    ? undefined
    : {
        targetKind: String(row['target_kind']),
        targetId: String(row['target_id']),
        lastSourceHash: String(row['last_source_hash']),
        lastTargetHash: String(row['last_imported_target_hash']),
      };
}

export function targetProjectionHash(
  database: DatabaseSync,
  targetKind: string,
  targetId: string,
): string | null {
  if (targetKind === 'setting') {
    const row = database.prepare('SELECT value_json FROM settings WHERE key = ?').get(targetId);
    return row === undefined ? null : hashValue(row);
  }
  if (targetKind === 'occurrence') {
    const separator = targetId.lastIndexOf(':');
    if (separator < 1) return null;
    const row = database
      .prepare(
        `SELECT status, completed_at_ms, cancelled_at_ms, updated_at_ms
         FROM recurring_task_occurrences WHERE template_id = ? AND occurrence_date = ?`,
      )
      .get(targetId.slice(0, separator), targetId.slice(separator + 1));
    return row === undefined ? null : hashValue(row);
  }
  const projection = PROJECTIONS[targetKind];
  if (projection === undefined) return null;
  const row = database
    .prepare(`SELECT ${projection.columns} FROM ${projection.table} WHERE id = ?`)
    .get(targetId);
  return row === undefined ? null : hashValue(row);
}

export function exactLearningTarget(database: DatabaseSync, bvid: string): string | null {
  const row = database
    .prepare(
      `SELECT id FROM learning_resources
       WHERE platform = 'bilibili' AND external_id = ? AND deleted_at_ms IS NULL`,
    )
    .get(bvid) as Row | undefined;
  return row === undefined ? null : String(row['id']);
}

export function similarLearningTarget(database: DatabaseSync, bvid: string): string | null {
  const row = database
    .prepare(
      `SELECT id FROM learning_resources
       WHERE platform = 'bilibili' AND lower(external_id) = lower(?)
         AND external_id <> ? AND deleted_at_ms IS NULL LIMIT 1`,
    )
    .get(bvid, bvid) as Row | undefined;
  return row === undefined ? null : String(row['id']);
}
