import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ParsedImportSource, PlannedEntity, PlannedTombstone } from './contracts.js';
import { hashValue } from './source-hash.js';
import {
  exactLearningTarget,
  similarLearningTarget,
  sourceReference,
  targetProjectionHash,
} from './target-projection.js';

interface ReconciliationResult {
  readonly entities: PlannedEntity[];
  readonly tombstones: PlannedTombstone[];
  readonly warnings: ParsedImportSource['warnings'];
  readonly targetBaselineSha256: string;
}

function sourceUpdatedAt(entity: ParsedImportSource['entities'][number]): number {
  const value = entity.payload;
  if ('updatedAtMs' in value) return value.updatedAtMs;
  if ('importedAtMs' in value) return value.importedAtMs;
  if ('createdAtMs' in value) return value.createdAtMs;
  return 0;
}

function personalDeletion(
  database: DatabaseSync,
  sourceKind: string,
  sourceId: string,
): { deletedAtMs: number; contributionInactive: boolean } | null {
  const marker = database
    .prepare(
      `SELECT deleted_at_ms FROM deletion_markers
       WHERE source_system = 'personal-json' AND entity_kind = ? AND source_id = ?
       ORDER BY deleted_at_ms DESC LIMIT 1`,
    )
    .get(sourceKind, sourceId);
  if (marker === undefined) return null;
  const contribution = database
    .prepare(
      `SELECT active FROM source_contributions
       WHERE source_system = 'personal-json' AND source_kind = ? AND source_id = ?`,
    )
    .get(sourceKind, sourceId);
  return {
    deletedAtMs: Number(marker['deleted_at_ms']),
    contributionInactive: contribution !== undefined && Number(contribution['active']) === 0,
  };
}

export function reconcileSource(
  database: DatabaseSync,
  parsed: ParsedImportSource,
  createId: () => string = randomUUID,
): ReconciliationResult {
  const planned: PlannedEntity[] = [];
  const warnings = [...parsed.warnings];
  const learningTargets = new Map<string, string>();
  const recurringTargets = new Map<string, string>();

  for (const entity of parsed.entities) {
    const existing = sourceReference(
      database,
      parsed.sourceType,
      entity.sourceKind,
      entity.sourceId,
    );
    let targetId = existing?.targetId ?? createId();
    let forcedConflict = false;
    let safeResurrection = false;
    if (parsed.sourceType === 'personal-json') {
      const deletion = personalDeletion(database, entity.sourceKind, entity.sourceId);
      if (deletion !== null) {
        if (entity.sourceKind === 'fixed_task' || deletion.deletedAtMs >= sourceUpdatedAt(entity)) {
          forcedConflict = true;
        } else {
          safeResurrection = deletion.contributionInactive;
        }
      }
      if (entity.payload.kind === 'occurrence') {
        const parentDeletion = personalDeletion(
          database,
          'fixed_task',
          entity.payload.templateSourceId,
        );
        if (parentDeletion !== null) forcedConflict = true;
      }
    }
    if (entity.payload.kind === 'learning' || entity.payload.kind === 'qoder-video') {
      const bvid = entity.payload.bvid;
      targetId =
        existing?.targetId ??
        learningTargets.get(bvid) ??
        exactLearningTarget(database, bvid) ??
        createId();
      learningTargets.set(bvid, targetId);
      forcedConflict = existing === undefined && similarLearningTarget(database, bvid) !== null;
    }
    if (entity.payload.kind === 'recurring') recurringTargets.set(entity.sourceId, targetId);
    if (entity.payload.kind === 'occurrence') {
      const templateTarget =
        recurringTargets.get(entity.payload.templateSourceId) ??
        sourceReference(database, parsed.sourceType, 'fixed_task', entity.payload.templateSourceId)
          ?.targetId;
      if (templateTarget !== undefined) targetId = `${templateTarget}:${entity.payload.date}`;
      else forcedConflict = true;
    }
    if (entity.payload.kind === 'setting') targetId = entity.payload.key;
    if (existing === undefined && entity.payload.kind === 'task') {
      const possible = database
        .prepare(
          `SELECT id FROM tasks WHERE task_date = ? AND title = ? AND deleted_at_ms IS NULL LIMIT 1`,
        )
        .get(entity.payload.date, entity.payload.title);
      if (possible !== undefined) {
        warnings.push({
          code: 'POSSIBLE_DUPLICATE_TASK',
          entity: 'task',
          sourceId: entity.sourceId,
          message: '发现同日同标题任务，按安全策略仍保留为独立任务',
        });
      }
    }

    const baselineTargetHash = targetProjectionHash(database, entity.targetKind, targetId);
    let action: PlannedEntity['action'];
    if (forcedConflict) action = 'conflict';
    else if (safeResurrection) action = existing === undefined ? 'add' : 'update';
    else if (existing?.lastSourceHash === entity.sourceHash) action = 'unchanged';
    else if (existing === undefined) action = 'add';
    else if (baselineTargetHash === existing.lastTargetHash) action = 'update';
    else action = 'conflict';
    planned.push({ ...entity, action, targetId, baselineTargetHash });
  }

  if (parsed.sourceType === 'qoder-sqlite') {
    const active = new Set(
      parsed.entities.map(({ sourceKind, sourceId }) => `${sourceKind}:${sourceId}`),
    );
    const prior = database
      .prepare(
        `SELECT source_kind, source_id FROM source_refs
         WHERE source_system = 'qoder-sqlite' ORDER BY source_kind, source_id`,
      )
      .all();
    for (const row of prior) {
      const sourceKind = String(row['source_kind']);
      const sourceId = String(row['source_id']);
      if (!active.has(`${sourceKind}:${sourceId}`)) {
        warnings.push({
          code: 'QODER_MISSING_FROM_SOURCE',
          entity: sourceKind,
          sourceId,
          message: '该来源记录本次缺失，按安全策略不视为删除',
        });
      }
    }
  }

  const tombstones: PlannedTombstone[] = parsed.tombstones.map((marker) => {
    const row = database
      .prepare(
        `SELECT deleted_at_ms FROM deletion_markers
         WHERE source_system = 'personal-json' AND entity_kind = ? AND source_id = ?
           AND canonical_key = ?`,
      )
      .get(marker.entityKind, marker.sourceId, marker.canonicalKey ?? '');
    const baselineDeletedAtMs = row === undefined ? null : Number(row['deleted_at_ms']);
    const reference = sourceReference(
      database,
      'personal-json',
      marker.entityKind,
      marker.sourceId,
    );
    const baselineTargetHash =
      reference === undefined
        ? null
        : targetProjectionHash(database, reference.targetKind, reference.targetId);
    const targetChanged =
      reference !== undefined && baselineTargetHash !== reference.lastTargetHash;
    return {
      ...marker,
      action: targetChanged
        ? 'conflict'
        : baselineDeletedAtMs === null
          ? 'add'
          : baselineDeletedAtMs === marker.deletedAtMs
            ? 'unchanged'
            : 'update',
      baselineDeletedAtMs,
      targetKind: reference?.targetKind ?? null,
      targetId: reference?.targetId ?? null,
      baselineTargetHash,
    };
  });

  return {
    entities: planned,
    tombstones,
    warnings,
    targetBaselineSha256: hashValue({
      entities: planned.map(({ targetKind, targetId, baselineTargetHash }) => ({
        targetKind,
        targetId,
        baselineTargetHash,
      })),
      tombstones: tombstones.map(
        ({
          entityKind,
          sourceId,
          canonicalKey,
          baselineDeletedAtMs,
          targetKind,
          targetId,
          baselineTargetHash,
        }) => ({
          entityKind,
          sourceId,
          canonicalKey,
          baselineDeletedAtMs,
          targetKind,
          targetId,
          baselineTargetHash,
        }),
      ),
    }),
  };
}
