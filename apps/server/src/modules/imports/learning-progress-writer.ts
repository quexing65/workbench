import {
  epochMillisecondsToIso,
  mergeLearningObservation,
  type LearningPartProgressState,
  type LearningProgressPart,
  type LearningProgressState,
} from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;

function progressState(row: Row | undefined): LearningProgressState {
  return {
    furthestPartId:
      row === undefined || row['furthest_part_id'] === null
        ? null
        : String(row['furthest_part_id']),
    furthestSeconds: row === undefined ? 0 : Number(row['furthest_seconds']),
    resumePartId:
      row === undefined || row['resume_part_id'] === null ? null : String(row['resume_part_id']),
    resumeSeconds: row === undefined ? 0 : Number(row['resume_seconds']),
    completed: row === undefined ? false : Number(row['completed']) === 1,
    completedAt:
      row === undefined || row['completed_at_ms'] === null
        ? null
        : epochMillisecondsToIso(Number(row['completed_at_ms'])),
    lastObservedAt:
      row === undefined || row['last_observed_at_ms'] === null
        ? null
        : epochMillisecondsToIso(Number(row['last_observed_at_ms'])),
    manualOverrideAt:
      row === undefined || row['manual_override_at_ms'] === null
        ? null
        : epochMillisecondsToIso(Number(row['manual_override_at_ms'])),
  };
}

function partState(row: Row | undefined): LearningPartProgressState | null {
  if (row === undefined) return null;
  return {
    furthestSeconds: Number(row['furthest_seconds']),
    completed: Number(row['completed']) === 1,
    completedAt:
      row['completed_at_ms'] === null
        ? null
        : epochMillisecondsToIso(Number(row['completed_at_ms'])),
    lastObservedAt:
      row['last_observed_at_ms'] === null
        ? null
        : epochMillisecondsToIso(Number(row['last_observed_at_ms'])),
  };
}

export function mergeImportedObservation(
  database: DatabaseSync,
  resourceId: string,
  partId: string,
  seconds: number,
  observedAtMs: number,
  now: number,
): void {
  const parts = database
    .prepare(
      `SELECT id, part_number, duration_seconds FROM learning_parts
       WHERE resource_id = ? AND deleted_at_ms IS NULL ORDER BY part_number`,
    )
    .all(resourceId)
    .map((row) => ({
      id: String(row['id']),
      partNumber: Number(row['part_number']),
      durationSeconds: Number(row['duration_seconds']),
    })) as LearningProgressPart[];
  const resourceRow = database
    .prepare('SELECT * FROM learning_resource_progress WHERE resource_id = ?')
    .get(resourceId) as Row | undefined;
  const partRow = database
    .prepare('SELECT * FROM learning_part_progress WHERE part_id = ?')
    .get(partId) as Row | undefined;
  const merged = mergeLearningObservation(parts, progressState(resourceRow), partState(partRow), {
    partId,
    seconds,
    observedAt: epochMillisecondsToIso(observedAtMs),
  });
  database
    .prepare(
      `INSERT INTO learning_resource_progress (
        resource_id, furthest_part_id, furthest_seconds, resume_part_id, resume_seconds,
        completed, completed_at_ms, last_observed_at_ms, manual_override_at_ms,
        updated_at_ms, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(resource_id) DO UPDATE SET furthest_part_id=excluded.furthest_part_id,
        furthest_seconds=excluded.furthest_seconds, resume_part_id=excluded.resume_part_id,
        resume_seconds=excluded.resume_seconds, completed=excluded.completed,
        completed_at_ms=excluded.completed_at_ms, last_observed_at_ms=excluded.last_observed_at_ms,
        manual_override_at_ms=excluded.manual_override_at_ms, updated_at_ms=excluded.updated_at_ms,
        revision=learning_resource_progress.revision+1`,
    )
    .run(
      resourceId,
      merged.progress.furthestPartId,
      merged.progress.furthestSeconds,
      merged.progress.resumePartId,
      merged.progress.resumeSeconds,
      merged.progress.completed ? 1 : 0,
      merged.progress.completedAt === null ? null : Date.parse(merged.progress.completedAt),
      merged.progress.lastObservedAt === null ? null : Date.parse(merged.progress.lastObservedAt),
      merged.progress.manualOverrideAt === null
        ? null
        : Date.parse(merged.progress.manualOverrideAt),
      now,
    );
  database
    .prepare(
      `INSERT INTO learning_part_progress (
        part_id, furthest_seconds, completed, completed_at_ms, last_observed_at_ms,
        updated_at_ms, revision
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(part_id) DO UPDATE SET furthest_seconds=excluded.furthest_seconds,
        completed=excluded.completed, completed_at_ms=excluded.completed_at_ms,
        last_observed_at_ms=excluded.last_observed_at_ms, updated_at_ms=excluded.updated_at_ms,
        revision=learning_part_progress.revision+1`,
    )
    .run(
      partId,
      merged.partProgress.furthestSeconds,
      merged.partProgress.completed ? 1 : 0,
      merged.partProgress.completedAt === null ? null : Date.parse(merged.partProgress.completedAt),
      merged.partProgress.lastObservedAt === null
        ? null
        : Date.parse(merged.partProgress.lastObservedAt),
      now,
    );
}
