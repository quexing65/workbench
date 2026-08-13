import type { LearningPartProgress, LearningProgress, LearningResource } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

import { withTransaction } from '../../db/transaction.js';
import type { LearningResourceReader } from './resource-reader.js';

export class LearningProgressRepository {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly reader: LearningResourceReader,
  ) {}

  public updateObservation(
    resourceId: string,
    expectedRevision: number,
    partId: string,
    next: {
      readonly progress: Omit<LearningProgress, 'revision'>;
      readonly partProgress: Omit<LearningPartProgress, 'revision'>;
    },
    now: number,
  ): LearningResource | undefined {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE learning_resource_progress SET
             furthest_part_id = ?, furthest_seconds = ?, resume_part_id = ?, resume_seconds = ?,
             completed = ?, completed_at_ms = ?, last_observed_at_ms = ?, manual_override_at_ms = ?,
             updated_at_ms = ?, revision = revision + 1
           WHERE resource_id = ? AND revision = ?`,
        )
        .run(
          next.progress.furthestPartId,
          next.progress.furthestSeconds,
          next.progress.resumePartId,
          next.progress.resumeSeconds,
          next.progress.completed ? 1 : 0,
          next.progress.completedAt === null ? null : Date.parse(next.progress.completedAt),
          next.progress.lastObservedAt === null ? null : Date.parse(next.progress.lastObservedAt),
          next.progress.manualOverrideAt === null
            ? null
            : Date.parse(next.progress.manualOverrideAt),
          now,
          resourceId,
          expectedRevision,
        );
      if (result.changes === 0) return undefined;
      this.upsertPartProgress(partId, next.partProgress, now);
      return this.reader.findRequired(resourceId);
    });
  }

  public manualProgress(
    resourceId: string,
    revision: number,
    action: 'complete' | 'reset',
    now: number,
  ): LearningResource | undefined {
    return withTransaction(this.database, () => {
      const result =
        action === 'complete'
          ? this.database
              .prepare(
                `UPDATE learning_resource_progress SET completed = 1, completed_at_ms = ?,
                   manual_override_at_ms = ?, updated_at_ms = ?, revision = revision + 1
                 WHERE resource_id = ? AND revision = ?`,
              )
              .run(now, now, now, resourceId, revision)
          : this.database
              .prepare(
                `UPDATE learning_resource_progress SET furthest_part_id = NULL, furthest_seconds = 0,
                   resume_part_id = NULL, resume_seconds = 0, completed = 0, completed_at_ms = NULL,
                   last_observed_at_ms = NULL, manual_override_at_ms = ?, updated_at_ms = ?,
                   revision = revision + 1 WHERE resource_id = ? AND revision = ?`,
              )
              .run(now, now, resourceId, revision);
      if (result.changes === 0) return undefined;
      if (action === 'reset') {
        this.database
          .prepare(
            `DELETE FROM learning_part_progress
             WHERE part_id IN (SELECT id FROM learning_parts WHERE resource_id = ?)`,
          )
          .run(resourceId);
      }
      return this.reader.findRequired(resourceId);
    });
  }

  private upsertPartProgress(
    partId: string,
    progress: Omit<LearningPartProgress, 'revision'>,
    now: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO learning_part_progress
         (part_id, furthest_seconds, completed, completed_at_ms, last_observed_at_ms,
          updated_at_ms, revision) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(part_id) DO UPDATE SET
           furthest_seconds = excluded.furthest_seconds, completed = excluded.completed,
           completed_at_ms = excluded.completed_at_ms,
           last_observed_at_ms = excluded.last_observed_at_ms,
           updated_at_ms = excluded.updated_at_ms, revision = revision + 1`,
      )
      .run(
        partId,
        progress.furthestSeconds,
        progress.completed ? 1 : 0,
        progress.completedAt === null ? null : Date.parse(progress.completedAt),
        progress.lastObservedAt === null ? null : Date.parse(progress.lastObservedAt),
        now,
      );
  }
}
