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
      readonly watchedDelta: number;
      readonly observedAt: string;
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
      this.recordWatchedSeconds(partId, next.watchedDelta, next.observedAt);
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
         (part_id, furthest_seconds, watched_seconds, last_seconds, completed, completed_at_ms,
          last_observed_at_ms, updated_at_ms, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(part_id) DO UPDATE SET
           furthest_seconds = excluded.furthest_seconds,
           watched_seconds = excluded.watched_seconds, last_seconds = excluded.last_seconds,
           completed = excluded.completed, completed_at_ms = excluded.completed_at_ms,
           last_observed_at_ms = excluded.last_observed_at_ms,
           updated_at_ms = excluded.updated_at_ms, revision = revision + 1`,
      )
      .run(
        partId,
        progress.furthestSeconds,
        progress.watchedSeconds,
        progress.lastSeconds,
        progress.completed ? 1 : 0,
        progress.completedAt === null ? null : Date.parse(progress.completedAt),
        progress.lastObservedAt === null ? null : Date.parse(progress.lastObservedAt),
        now,
      );
  }

  private recordWatchedSeconds(partId: string, watchedDelta: number, observedAt: string): void {
    if (watchedDelta <= 0) return;
    // 与 insights 查询口径一致：按 UTC+8 业务日归属观看时长。
    const watchDate = new Date(Date.parse(observedAt) + 8 * 3_600_000).toISOString().slice(0, 10);
    this.database
      .prepare(
        `INSERT INTO learning_watch_daily (part_id, watch_date, watched_seconds) VALUES (?, ?, ?)
         ON CONFLICT(part_id, watch_date) DO UPDATE SET
           watched_seconds = watched_seconds + excluded.watched_seconds`,
      )
      .run(partId, watchDate, watchedDelta);
  }
}
