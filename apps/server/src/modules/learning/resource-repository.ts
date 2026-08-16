import type {
  LearningPartProgress,
  LearningProgress,
  LearningResource,
  UnresolvedLearningLink,
} from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

import { withTransaction } from '../../db/transaction.js';
import type { BiliVideoMetadata } from './bili-client.js';
import { LearningProgressRepository } from './progress-repository.js';
import { LearningResourceReader } from './resource-reader.js';
import { removeResourceFromSeries } from './series-membership.js';

interface UnresolvedRow {
  id: string;
  normalized_url: string;
  requested_part_number: number;
  revision: number;
}

export class LearningResourceRepository {
  private readonly reader: LearningResourceReader;
  private readonly progress: LearningProgressRepository;

  public constructor(private readonly database: DatabaseSync) {
    this.reader = new LearningResourceReader(database);
    this.progress = new LearningProgressRepository(database, this.reader);
  }

  public list(): LearningResource[] {
    return this.reader.list();
  }

  public find(id: string): LearningResource | undefined {
    return this.reader.find(id);
  }

  public findByExternalId(externalId: string): LearningResource | undefined {
    return this.reader.findByExternalId(externalId);
  }

  public upsertMetadata(
    metadata: BiliVideoMetadata,
    now: number,
    createId: () => string,
  ): LearningResource {
    return withTransaction(this.database, () => {
      const existing = this.findByExternalId(metadata.bvid);
      const resourceId = existing?.id ?? createId();
      if (existing === undefined) this.insertResource(resourceId, metadata, now);
      else this.updateResource(resourceId, metadata, now);
      this.upsertParts(resourceId, metadata, now, createId);
      return this.reader.findRequired(resourceId);
    });
  }

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
    return this.progress.updateObservation(resourceId, expectedRevision, partId, next, now);
  }

  public manualProgress(
    resourceId: string,
    revision: number,
    action: 'complete' | 'reset',
    now: number,
  ): LearningResource | undefined {
    return this.progress.manualProgress(resourceId, revision, action, now);
  }

  public softDelete(id: string, revision: number, now: number): boolean {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE learning_resources SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
           WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?`,
        )
        .run(now, now, id, revision);
      if (result.changes === 0) return false;
      removeResourceFromSeries(this.database, id, now);
      return true;
    });
  }

  public unresolved(
    normalizedUrl: string,
    partNumber: number,
    now: number,
    id: string,
  ): UnresolvedLearningLink {
    this.database
      .prepare(
        `INSERT INTO unresolved_learning_links
         (id, normalized_url, title, requested_part_number, status, created_at_ms, updated_at_ms, revision)
         VALUES (?, ?, '待解析的 B站短链', ?, 'not_started', ?, ?, 1)
         ON CONFLICT(normalized_url) DO UPDATE SET requested_part_number = excluded.requested_part_number,
           resolved_resource_id = NULL, deleted_at_ms = NULL,
           updated_at_ms = excluded.updated_at_ms, revision = revision + 1`,
      )
      .run(id, normalizedUrl, partNumber, now, now);
    const row = this.database
      .prepare(
        `SELECT id, normalized_url, requested_part_number, revision
         FROM unresolved_learning_links WHERE normalized_url = ? AND deleted_at_ms IS NULL`,
      )
      .get(normalizedUrl) as unknown as UnresolvedRow | undefined;
    if (row === undefined)
      throw new Error('Unresolved learning link write did not produce an entity');
    return {
      id: row.id,
      normalizedUrl: row.normalized_url,
      requestedPartNumber: row.requested_part_number,
      revision: row.revision,
    };
  }

  public resolveUnresolved(normalizedUrl: string, resourceId: string, now: number): void {
    this.database
      .prepare(
        `UPDATE unresolved_learning_links SET resolved_resource_id = ?, updated_at_ms = ?,
           deleted_at_ms = ?, revision = revision + 1
         WHERE normalized_url = ? AND deleted_at_ms IS NULL`,
      )
      .run(resourceId, now, now, normalizedUrl);
  }

  private insertResource(id: string, metadata: BiliVideoMetadata, now: number): void {
    this.database
      .prepare(
        `INSERT INTO learning_resources
         (id, platform, external_id, source_url, title, cover_url, uploader_name,
          duration_seconds, metadata_updated_at_ms, created_at_ms, updated_at_ms, revision)
         VALUES (?, 'bilibili', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        id,
        metadata.bvid,
        metadata.sourceUrl,
        metadata.title,
        metadata.coverUrl,
        metadata.uploaderName,
        metadata.durationSeconds,
        now,
        now,
        now,
      );
    this.database
      .prepare(
        'INSERT INTO learning_resource_progress (resource_id, updated_at_ms, revision) VALUES (?, ?, 1)',
      )
      .run(id, now);
  }

  private updateResource(id: string, metadata: BiliVideoMetadata, now: number): void {
    this.database
      .prepare(
        `UPDATE learning_resources SET source_url = ?, title = ?, cover_url = ?,
           uploader_name = ?, duration_seconds = ?, metadata_updated_at_ms = ?,
           updated_at_ms = ?, revision = revision + 1 WHERE id = ?`,
      )
      .run(
        metadata.sourceUrl,
        metadata.title,
        metadata.coverUrl,
        metadata.uploaderName,
        metadata.durationSeconds,
        now,
        now,
        id,
      );
  }

  private upsertParts(
    resourceId: string,
    metadata: BiliVideoMetadata,
    now: number,
    createId: () => string,
  ): void {
    this.database
      .prepare(
        `UPDATE learning_parts SET part_number = part_number + 1000000
         WHERE resource_id = ? AND deleted_at_ms IS NULL`,
      )
      .run(resourceId);
    const cids = new Set(metadata.parts.map(({ cid }) => cid));
    for (const item of metadata.parts) this.upsertPart(resourceId, item, now, createId);
    const old = this.database
      .prepare(
        `SELECT id, external_part_id FROM learning_parts
         WHERE resource_id = ? AND deleted_at_ms IS NULL`,
      )
      .all(resourceId) as Array<{ id: string; external_part_id: string }>;
    for (const item of old) {
      if (!cids.has(item.external_part_id)) this.removePartReference(resourceId, item.id, now);
    }
  }

  private upsertPart(
    resourceId: string,
    item: BiliVideoMetadata['parts'][number],
    now: number,
    createId: () => string,
  ): void {
    const existing = this.database
      .prepare(
        `SELECT id FROM learning_parts
         WHERE resource_id = ? AND external_part_id = ? AND deleted_at_ms IS NULL`,
      )
      .get(resourceId, item.cid) as { id: string } | undefined;
    if (existing === undefined) {
      this.database
        .prepare(
          `INSERT INTO learning_parts
           (id, resource_id, external_part_id, part_number, title, duration_seconds,
            created_at_ms, updated_at_ms, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          createId(),
          resourceId,
          item.cid,
          item.partNumber,
          item.title,
          item.durationSeconds,
          now,
          now,
        );
      return;
    }
    this.database
      .prepare(
        `UPDATE learning_parts SET part_number = ?, title = ?, duration_seconds = ?,
         updated_at_ms = ?, revision = revision + 1 WHERE id = ?`,
      )
      .run(item.partNumber, item.title, item.durationSeconds, now, existing.id);
    this.clampProgress(existing.id, item.durationSeconds, now);
  }

  private removePartReference(resourceId: string, partId: string, now: number): void {
    this.database
      .prepare(
        `UPDATE learning_resource_progress SET
           furthest_part_id = CASE WHEN furthest_part_id = ? THEN NULL ELSE furthest_part_id END,
           furthest_seconds = CASE WHEN furthest_part_id = ? THEN 0 ELSE furthest_seconds END,
           resume_part_id = CASE WHEN resume_part_id = ? THEN NULL ELSE resume_part_id END,
           resume_seconds = CASE WHEN resume_part_id = ? THEN 0 ELSE resume_seconds END,
           updated_at_ms = ?, revision = revision + 1
         WHERE resource_id = ? AND (furthest_part_id = ? OR resume_part_id = ?)`,
      )
      .run(partId, partId, partId, partId, now, resourceId, partId, partId);
    this.database
      .prepare(
        `UPDATE learning_parts SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
         WHERE id = ?`,
      )
      .run(now, now, partId);
  }

  private clampProgress(partId: string, duration: number, now: number): void {
    this.database
      .prepare(
        `UPDATE learning_part_progress SET furthest_seconds = min(furthest_seconds, ?),
         updated_at_ms = ?, revision = revision + 1 WHERE part_id = ? AND furthest_seconds > ?`,
      )
      .run(duration, now, partId, duration);
    this.database
      .prepare(
        `UPDATE learning_resource_progress SET furthest_seconds = min(furthest_seconds, ?),
         updated_at_ms = ?, revision = revision + 1
         WHERE furthest_part_id = ? AND furthest_seconds > ?`,
      )
      .run(duration, now, partId, duration);
    this.database
      .prepare(
        `UPDATE learning_resource_progress SET resume_seconds = min(resume_seconds, ?),
         updated_at_ms = ?, revision = revision + 1
         WHERE resume_part_id = ? AND resume_seconds > ?`,
      )
      .run(duration, now, partId, duration);
  }
}
