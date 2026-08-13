import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { writeBusinessEntity } from './business-writer.js';
import type { PersistedImportPlan, PlannedEntity } from './contracts.js';
import { writeLearningEntity } from './learning-writer.js';
import { targetProjectionHash } from './target-projection.js';

export type ImportFaultPoint =
  | 'after-staging'
  | 'after-tasks'
  | 'after-notes'
  | 'after-series'
  | 'after-parts'
  | 'before-commit';

function contributionMetadata(entity: PlannedEntity): {
  canonicalKey: string | null;
  updatedAtMs: number;
} {
  const value = entity.payload;
  if (value.kind === 'learning') {
    return {
      canonicalKey: `${value.bvid.toUpperCase()}:p${value.partNumber}`,
      updatedAtMs: value.updatedAtMs,
    };
  }
  if (value.kind === 'unresolved') {
    return {
      canonicalKey: `b23:${new URL(value.normalizedUrl).pathname.replace(/\/$/u, '').toLowerCase()}`,
      updatedAtMs: value.updatedAtMs,
    };
  }
  if (value.kind === 'qoder-video') {
    return { canonicalKey: value.bvid, updatedAtMs: value.importedAtMs };
  }
  if ('updatedAtMs' in value) return { canonicalKey: null, updatedAtMs: value.updatedAtMs };
  if ('createdAtMs' in value) return { canonicalKey: null, updatedAtMs: value.createdAtMs };
  return { canonicalKey: null, updatedAtMs: 0 };
}

export class ImportApplier {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly createId: () => string = randomUUID,
    private readonly injectFault: (point: ImportFaultPoint) => void = () => undefined,
  ) {}

  public apply(plan: PersistedImportPlan, applyId: string, now: number): void {
    this.injectFault('after-staging');
    const phases: readonly [ImportFaultPoint, readonly string[]][] = [
      ['after-tasks', ['task', 'recurring', 'occurrence']],
      ['after-notes', ['note']],
      ['after-series', ['series']],
      ['after-parts', ['learning', 'qoder-video', 'unresolved', 'setting']],
    ];
    for (const [point, kinds] of phases) {
      for (const entity of plan.entities.filter(({ payload }) => kinds.includes(payload.kind))) {
        this.applyEntity(plan, entity, applyId, now);
      }
      this.injectFault(point);
    }
    this.applyTombstones(plan, applyId, now);
  }

  private applyEntity(
    plan: PersistedImportPlan,
    entity: PlannedEntity,
    applyId: string,
    now: number,
  ): void {
    if (entity.action === 'unchanged' || entity.action === 'conflict') return;
    if (!writeBusinessEntity(this.database, entity, now)) {
      if (!writeLearningEntity(this.database, entity, now, this.createId)) {
        throw new Error('Unsupported import entity');
      }
    }
    const targetHash = targetProjectionHash(this.database, entity.targetKind, entity.targetId);
    if (targetHash === null) throw new Error('Imported target projection is unavailable');
    const contribution = contributionMetadata(entity);
    this.database
      .prepare(
        `INSERT INTO source_refs (
          source_system, source_kind, source_id, target_kind, target_id,
          last_source_hash, last_imported_target_hash, last_imported_at_ms, import_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_system, source_kind, source_id) DO UPDATE SET
          target_kind=excluded.target_kind, target_id=excluded.target_id,
          last_source_hash=excluded.last_source_hash,
          last_imported_target_hash=excluded.last_imported_target_hash,
          last_imported_at_ms=excluded.last_imported_at_ms, import_run_id=excluded.import_run_id`,
      )
      .run(
        plan.sourceType,
        entity.sourceKind,
        entity.sourceId,
        entity.targetKind,
        entity.targetId,
        entity.sourceHash,
        targetHash,
        now,
        applyId,
      );
    this.database
      .prepare(
        `INSERT INTO source_contributions (
          source_system, source_kind, source_id, canonical_key, target_kind, target_id,
          source_updated_at_ms, created_target, active, updated_at_ms, import_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(source_system, source_kind, source_id) DO UPDATE SET
          canonical_key=excluded.canonical_key, target_kind=excluded.target_kind,
          target_id=excluded.target_id, source_updated_at_ms=excluded.source_updated_at_ms,
          created_target=source_contributions.created_target, active=1,
          updated_at_ms=excluded.updated_at_ms, import_run_id=excluded.import_run_id`,
      )
      .run(
        plan.sourceType,
        entity.sourceKind,
        entity.sourceId,
        contribution.canonicalKey,
        entity.targetKind,
        entity.targetId,
        contribution.updatedAtMs,
        entity.baselineTargetHash === null ? 1 : 0,
        now,
        applyId,
      );
  }

  private applyTombstones(plan: PersistedImportPlan, applyId: string, now: number): void {
    for (const marker of plan.tombstones) {
      if (marker.action === 'unchanged') continue;
      this.database
        .prepare(
          `INSERT INTO deletion_markers (
            source_system, entity_kind, source_id, canonical_key, deleted_at_ms, import_run_id
          ) VALUES ('personal-json', ?, ?, ?, ?, ?)
          ON CONFLICT(source_system, entity_kind, source_id, canonical_key) DO UPDATE SET
            deleted_at_ms=excluded.deleted_at_ms, import_run_id=excluded.import_run_id`,
        )
        .run(
          marker.entityKind,
          marker.sourceId,
          marker.canonicalKey ?? '',
          marker.deletedAtMs,
          applyId,
        );
      if (marker.action === 'conflict') continue;
      this.removeContributions(marker, applyId, now);
    }
  }

  private removeContributions(
    marker: PersistedImportPlan['tombstones'][number],
    applyId: string,
    now: number,
  ): void {
    const sourceKind = marker.entityKind === 'fixed_task' ? 'fixed_task' : marker.entityKind;
    const rows =
      marker.entityKind === 'fixed_task'
        ? this.database
            .prepare(
              `SELECT source_kind, source_id, target_kind, target_id,
                source_updated_at_ms, created_target
               FROM source_contributions
               WHERE source_system = 'personal-json' AND active = 1 AND (
                 (source_kind = 'fixed_task' AND source_id = ?) OR
                 (source_kind = 'fixed_task_day' AND
                   substr(source_id, 1, length(?) + 1) = ? || ':')
               )`,
            )
            .all(marker.sourceId, marker.sourceId, marker.sourceId)
        : this.database
            .prepare(
              `SELECT source_kind, source_id, target_kind, target_id,
                source_updated_at_ms, created_target
               FROM source_contributions
               WHERE source_system = 'personal-json' AND source_kind = ? AND active = 1
                 AND (source_id = ? OR (? IS NOT NULL AND canonical_key = ?))`,
            )
            .all(sourceKind, marker.sourceId, marker.canonicalKey, marker.canonicalKey);
    for (const row of rows) {
      if (
        marker.entityKind !== 'fixed_task' &&
        marker.deletedAtMs < Number(row['source_updated_at_ms'])
      )
        continue;
      const targetKind = String(row['target_kind']);
      const targetId = String(row['target_id']);
      this.database
        .prepare(
          `UPDATE source_contributions SET active = 0, updated_at_ms = ?, import_run_id = ?
           WHERE source_system = 'personal-json' AND source_kind = ? AND source_id = ?`,
        )
        .run(now, applyId, String(row['source_kind']), String(row['source_id']));
      const remaining = this.database
        .prepare(
          `SELECT count(*) AS count FROM source_contributions
           WHERE target_kind = ? AND target_id = ? AND active = 1`,
        )
        .get(targetKind, targetId);
      if (Number(row['created_target']) === 1 && Number(remaining?.['count']) === 0) {
        this.softDeleteTarget(targetKind, targetId, now);
      }
    }
  }

  private softDeleteTarget(targetKind: string, targetId: string, now: number): void {
    const tables: Record<string, string> = {
      task: 'tasks',
      recurring: 'recurring_task_templates',
      note: 'notes',
      learning: 'learning_resources',
      unresolved: 'unresolved_learning_links',
    };
    const table = tables[targetKind];
    if (table === undefined) return;
    this.database
      .prepare(
        `UPDATE ${table} SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
         WHERE id = ? AND deleted_at_ms IS NULL`,
      )
      .run(now, now, targetId);
  }
}
