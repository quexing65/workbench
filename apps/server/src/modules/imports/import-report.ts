import type { ImportCount, ImportReport, ImportSourceType } from '@workbench/shared';

import type { PersistedImportPlan, PlannedEntity, PlannedTombstone } from './contracts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function emptyCount(): ImportCount {
  return { read: 0, add: 0, update: 0, unchanged: 0, conflict: 0, reject: 0 };
}

export function countsFor(
  entities: readonly PlannedEntity[],
  tombstones: readonly PlannedTombstone[],
  rejected: number,
): Record<string, ImportCount> {
  const counts: Record<string, ImportCount> = {};
  for (const entity of entities) {
    const count = counts[entity.sourceKind] ?? emptyCount();
    count.read += 1;
    count[entity.action] += 1;
    counts[entity.sourceKind] = count;
  }
  if (tombstones.length > 0) {
    const count = emptyCount();
    for (const marker of tombstones) {
      count.read += 1;
      count[marker.action] += 1;
    }
    counts['deletion_marker'] = count;
  }
  if (rejected > 0) {
    counts['rejected'] = { ...emptyCount(), read: rejected, reject: rejected };
  }
  return counts;
}

export function reportFromPlan(
  plan: PersistedImportPlan,
  mode: 'preflight' | 'apply' = 'preflight',
  status: ImportReport['status'] = plan.fatal.length === 0 ? 'ready' : 'failed',
): ImportReport {
  return {
    runId: plan.runId,
    sourceType: plan.sourceType,
    sourceSha256: plan.sourceSha256,
    sourceSchema: plan.sourceSchema,
    ...(plan.sourceTimezone === undefined ? {} : { sourceTimezone: plan.sourceTimezone }),
    mode,
    status,
    counts: countsFor(
      plan.entities,
      plan.tombstones,
      plan.warnings.filter(({ code }) => code.endsWith('REJECTED')).length,
    ),
    conflicts: [
      ...plan.entities
        .filter(({ action }) => action === 'conflict')
        .map((entity) => ({
          code: 'SOURCE_TARGET_CONFLICT',
          entity: entity.sourceKind,
          sourceId: entity.sourceId,
          ...(UUID.test(entity.targetId) ? { targetId: entity.targetId } : {}),
          fields: ['source', 'target'],
          resolution: 'keep-target' as const,
        })),
      ...plan.tombstones
        .filter(({ action }) => action === 'conflict')
        .map((marker) => ({
          code: 'TOMBSTONE_TARGET_CONFLICT',
          entity: marker.entityKind,
          sourceId: marker.sourceId,
          ...(marker.targetId !== null && UUID.test(marker.targetId)
            ? { targetId: marker.targetId }
            : {}),
          fields: ['deletedAt', 'target'],
          resolution: 'keep-target' as const,
        })),
    ],
    warnings: [...plan.warnings],
    fatal: [...plan.fatal],
    credentials: { detected: plan.credentialsDetected, migrated: false },
  };
}

export function failedReport(
  runId: string,
  sourceType: ImportSourceType,
  sourceSha256: string,
  code: string,
  message: string,
): ImportReport {
  return {
    runId,
    sourceType,
    sourceSha256,
    sourceSchema: 'unknown',
    mode: 'preflight',
    status: 'failed',
    counts: {},
    conflicts: [],
    warnings: [],
    fatal: [{ code, message }],
    credentials: { detected: false, migrated: false },
  };
}
