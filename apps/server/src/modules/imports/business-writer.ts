import type { DatabaseSync } from 'node:sqlite';

import type { PlannedEntity } from './contracts.js';

function writeTask(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'task') throw new Error('Task writer received the wrong entity kind');
  const value = entity.payload;
  database
    .prepare(
      `INSERT INTO tasks (
        id, title, description, task_date, status, completed_at_ms, cancelled_at_ms,
        created_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description,
        task_date=excluded.task_date, status=excluded.status,
        completed_at_ms=excluded.completed_at_ms, cancelled_at_ms=excluded.cancelled_at_ms,
        deleted_at_ms=NULL, updated_at_ms=excluded.updated_at_ms, revision=tasks.revision+1`,
    )
    .run(
      entity.targetId,
      value.title,
      value.description,
      value.date,
      value.status,
      value.completedAtMs,
      value.cancelledAtMs,
      value.createdAtMs,
      Math.max(value.updatedAtMs, now),
    );
}

function writeRecurring(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'recurring')
    throw new Error('Recurring writer received the wrong entity kind');
  const value = entity.payload;
  database
    .prepare(
      `INSERT INTO recurring_task_templates (
        id, title, description, schedule_type, start_date, end_date,
        created_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, '', 'daily', ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, start_date=excluded.start_date,
        end_date=excluded.end_date, deleted_at_ms=NULL, updated_at_ms=excluded.updated_at_ms,
        revision=recurring_task_templates.revision+1`,
    )
    .run(
      entity.targetId,
      value.title,
      value.startDate,
      value.endDate,
      value.createdAtMs,
      Math.max(value.updatedAtMs, now),
    );
}

function writeOccurrence(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'occurrence')
    throw new Error('Occurrence writer received the wrong entity kind');
  const separator = entity.targetId.lastIndexOf(':');
  if (separator < 1) throw new Error('Occurrence target identity is invalid');
  const value = entity.payload;
  database
    .prepare(
      `INSERT INTO recurring_task_occurrences (
        template_id, occurrence_date, status, completed_at_ms, cancelled_at_ms,
        updated_at_ms, revision
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(template_id, occurrence_date) DO UPDATE SET status=excluded.status,
        completed_at_ms=excluded.completed_at_ms, cancelled_at_ms=excluded.cancelled_at_ms,
        updated_at_ms=excluded.updated_at_ms, revision=recurring_task_occurrences.revision+1`,
    )
    .run(
      entity.targetId.slice(0, separator),
      entity.targetId.slice(separator + 1),
      value.status,
      value.completedAtMs,
      value.cancelledAtMs,
      Math.max(value.updatedAtMs, now),
    );
}

function writeNote(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'note') throw new Error('Note writer received the wrong entity kind');
  const value = entity.payload;
  database
    .prepare(
      `INSERT INTO notes (id, content, pinned, created_at_ms, updated_at_ms, revision)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET content=excluded.content, pinned=excluded.pinned,
         deleted_at_ms=NULL, updated_at_ms=excluded.updated_at_ms, revision=notes.revision+1`,
    )
    .run(
      entity.targetId,
      value.content,
      value.pinned ? 1 : 0,
      value.createdAtMs,
      Math.max(value.updatedAtMs, now),
    );
}

function writeSeries(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'series')
    throw new Error('Series writer received the wrong entity kind');
  const value = entity.payload;
  database
    .prepare(
      `INSERT INTO learning_series (id, name, created_at_ms, updated_at_ms, revision)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at_ms=excluded.updated_at_ms,
         deleted_at_ms=NULL, revision=learning_series.revision+1`,
    )
    .run(entity.targetId, value.name, value.createdAtMs, Math.max(value.createdAtMs, now));
}

function writeSetting(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'setting')
    throw new Error('Setting writer received the wrong entity kind');
  database
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at_ms) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
         updated_at_ms=excluded.updated_at_ms`,
    )
    .run(entity.payload.key, JSON.stringify(entity.payload.value), now);
}

export function writeBusinessEntity(
  database: DatabaseSync,
  entity: PlannedEntity,
  now: number,
): boolean {
  switch (entity.payload.kind) {
    case 'task':
      writeTask(database, entity, now);
      return true;
    case 'recurring':
      writeRecurring(database, entity, now);
      return true;
    case 'occurrence':
      writeOccurrence(database, entity, now);
      return true;
    case 'note':
      writeNote(database, entity, now);
      return true;
    case 'series':
      writeSeries(database, entity, now);
      return true;
    case 'setting':
      writeSetting(database, entity, now);
      return true;
    default:
      return false;
  }
}
