import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { LearningImportPayload, PlannedEntity, QoderVideoImportPayload } from './contracts.js';
import { mergeImportedObservation } from './learning-progress-writer.js';

type Row = Record<string, unknown>;

function partId(database: DatabaseSync, resourceId: string, partNumber: number): string | null {
  const row = database
    .prepare(
      `SELECT id FROM learning_parts
       WHERE resource_id = ? AND part_number = ? AND deleted_at_ms IS NULL`,
    )
    .get(resourceId, partNumber) as Row | undefined;
  return row === undefined ? null : String(row['id']);
}

function ensurePersonalResource(
  database: DatabaseSync,
  entity: PlannedEntity,
  value: LearningImportPayload,
  now: number,
  createId: () => string,
): void {
  database
    .prepare(
      `INSERT INTO learning_resources (
        id, platform, external_id, source_url, title, duration_seconds,
        created_at_ms, updated_at_ms, revision
      ) VALUES (?, 'bilibili', ?, ?, ?, 0, ?, ?, 1)
      ON CONFLICT(id) DO NOTHING`,
    )
    .run(entity.targetId, value.bvid, value.sourceUrl, value.title, value.createdAtMs, now);
  let selectedPartId = partId(database, entity.targetId, value.partNumber);
  if (selectedPartId === null) {
    selectedPartId = createId();
    const duration = Math.max(value.positionSeconds, 0);
    database
      .prepare(
        `INSERT INTO learning_parts (
          id, resource_id, external_part_id, part_number, title, duration_seconds,
          created_at_ms, updated_at_ms, revision
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        selectedPartId,
        entity.targetId,
        value.partNumber,
        value.partNumber === 1 ? value.title : `${value.title} P${value.partNumber}`,
        duration,
        value.createdAtMs,
        now,
      );
    database
      .prepare('UPDATE learning_resources SET duration_seconds = duration_seconds + ? WHERE id = ?')
      .run(duration, entity.targetId);
  }
  const observedAtMs = value.observedAtMs ?? value.updatedAtMs;
  mergeImportedObservation(
    database,
    entity.targetId,
    selectedPartId,
    value.positionSeconds,
    observedAtMs,
    now,
  );
  if (value.status === 'completed') {
    database
      .prepare(
        `UPDATE learning_part_progress SET completed = 1,
          completed_at_ms = COALESCE(completed_at_ms, ?), updated_at_ms = ?, revision = revision + 1
         WHERE part_id = ?`,
      )
      .run(value.completedAtMs ?? observedAtMs, now, selectedPartId);
  }
}

function ensureQoderParts(
  database: DatabaseSync,
  resourceId: string,
  value: QoderVideoImportPayload,
  now: number,
  createId: () => string,
): Map<number, string> {
  const ids = new Map<number, string>();
  for (const part of value.parts) {
    const existing = database
      .prepare(
        `SELECT id FROM learning_parts
         WHERE resource_id = ? AND (external_part_id = ? OR part_number = ?)
         ORDER BY external_part_id IS NULL DESC LIMIT 1`,
      )
      .get(resourceId, part.externalPartId, part.partNumber) as Row | undefined;
    const id = existing === undefined ? createId() : String(existing['id']);
    database
      .prepare(
        `INSERT INTO learning_parts (
          id, resource_id, external_part_id, part_number, title, duration_seconds,
          created_at_ms, updated_at_ms, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET external_part_id=excluded.external_part_id,
          part_number=excluded.part_number, title=excluded.title,
          duration_seconds=excluded.duration_seconds, deleted_at_ms=NULL,
          updated_at_ms=excluded.updated_at_ms, revision=learning_parts.revision+1`,
      )
      .run(
        id,
        resourceId,
        part.externalPartId,
        part.partNumber,
        part.title,
        part.durationSeconds,
        value.importedAtMs,
        now,
      );
    ids.set(part.partNumber, id);
  }
  return ids;
}

function ensureQoderResource(
  database: DatabaseSync,
  entity: PlannedEntity,
  value: QoderVideoImportPayload,
  now: number,
  createId: () => string,
): void {
  database
    .prepare(
      `INSERT INTO learning_resources (
        id, platform, external_id, source_url, title, cover_url, uploader_name,
        duration_seconds, metadata_updated_at_ms, created_at_ms, updated_at_ms, revision
      ) VALUES (?, 'bilibili', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url, title=excluded.title,
        cover_url=excluded.cover_url, uploader_name=excluded.uploader_name,
        duration_seconds=excluded.duration_seconds, metadata_updated_at_ms=excluded.metadata_updated_at_ms,
        deleted_at_ms=NULL, updated_at_ms=excluded.updated_at_ms,
        revision=learning_resources.revision+1`,
    )
    .run(
      entity.targetId,
      value.bvid,
      `https://www.bilibili.com/video/${value.bvid}/?p=1`,
      value.title,
      value.coverUrl,
      value.uploaderName,
      value.durationSeconds,
      value.importedAtMs,
      value.importedAtMs,
      now,
    );
  const parts = ensureQoderParts(database, entity.targetId, value, now, createId);
  const furthestPartId = parts.get(value.furthestPage);
  const resumePartId = parts.get(value.resumePage);
  if (furthestPartId === undefined || resumePartId === undefined) {
    throw new Error('Qoder progress references a missing part');
  }
  const observationTime = value.lastObservedAtMs ?? value.importedAtMs;
  mergeImportedObservation(
    database,
    entity.targetId,
    furthestPartId,
    value.furthestSeconds,
    observationTime,
    now,
  );
  if (resumePartId !== furthestPartId || value.resumeSeconds !== value.furthestSeconds) {
    mergeImportedObservation(
      database,
      entity.targetId,
      resumePartId,
      value.resumeSeconds,
      observationTime + 1,
      now,
    );
  }
  if (value.completed || value.manualOverrideAtMs !== null) {
    database
      .prepare(
        `UPDATE learning_resource_progress SET completed = ?, completed_at_ms = ?,
          manual_override_at_ms = ?, updated_at_ms = ?, revision = revision + 1
         WHERE resource_id = ? AND
           (manual_override_at_ms IS NULL OR manual_override_at_ms <= ?)`,
      )
      .run(
        value.completed ? 1 : 0,
        value.completed ? (value.manualOverrideAtMs ?? observationTime) : null,
        value.manualOverrideAtMs,
        now,
        entity.targetId,
        value.manualOverrideAtMs ?? observationTime,
      );
  }
  if (value.seriesSourceId !== null) {
    const series = database
      .prepare(
        `SELECT target_id FROM source_refs
         WHERE source_system = 'qoder-sqlite' AND source_kind = 'series' AND source_id = ?`,
      )
      .get(value.seriesSourceId);
    if (series === undefined) throw new Error('Qoder series mapping is unavailable');
    const seriesId = String(series['target_id']);
    const existing = database
      .prepare('SELECT position FROM learning_series_items WHERE series_id = ? AND resource_id = ?')
      .get(seriesId, entity.targetId);
    if (existing === undefined) {
      const next = database
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM learning_series_items WHERE series_id = ?',
        )
        .get(seriesId);
      database
        .prepare(
          `INSERT INTO learning_series_items (series_id, resource_id, position, created_at_ms)
           VALUES (?, ?, ?, ?)`,
        )
        .run(seriesId, entity.targetId, Number(next?.['position']), now);
    }
  }
}

function writeUnresolved(database: DatabaseSync, entity: PlannedEntity, now: number): void {
  if (entity.payload.kind !== 'unresolved')
    throw new Error('Unresolved writer received the wrong entity kind');
  const value = entity.payload;
  database
    .prepare(
      `INSERT INTO unresolved_learning_links (
        id, normalized_url, title, requested_part_number, position_seconds, status,
        last_opened_at_ms, created_at_ms, updated_at_ms, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,
        requested_part_number=excluded.requested_part_number,
        position_seconds=excluded.position_seconds, status=excluded.status,
        last_opened_at_ms=excluded.last_opened_at_ms, deleted_at_ms=NULL,
        updated_at_ms=excluded.updated_at_ms, revision=unresolved_learning_links.revision+1`,
    )
    .run(
      entity.targetId,
      value.normalizedUrl,
      value.title,
      value.partNumber,
      value.positionSeconds,
      value.status,
      value.lastOpenedAtMs,
      value.createdAtMs,
      now,
    );
}

export function writeLearningEntity(
  database: DatabaseSync,
  entity: PlannedEntity,
  now: number,
  createId: () => string = randomUUID,
): boolean {
  if (entity.payload.kind === 'learning') {
    ensurePersonalResource(database, entity, entity.payload, now, createId);
    return true;
  }
  if (entity.payload.kind === 'qoder-video') {
    ensureQoderResource(database, entity, entity.payload, now, createId);
    return true;
  }
  if (entity.payload.kind === 'unresolved') {
    writeUnresolved(database, entity, now);
    return true;
  }
  return false;
}
