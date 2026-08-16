import {
  epochMillisecondsToIso,
  type LearningPart,
  type LearningPartProgress,
  type LearningProgress,
  type LearningResource,
} from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

interface ResourceRow {
  id: string;
  external_id: string;
  source_url: string;
  title: string;
  cover_url: string | null;
  uploader_name: string | null;
  duration_seconds: number;
  revision: number;
}

interface ProgressRow {
  furthest_part_id: string | null;
  furthest_seconds: number;
  resume_part_id: string | null;
  resume_seconds: number;
  completed: number;
  completed_at_ms: number | null;
  last_observed_at_ms: number | null;
  manual_override_at_ms: number | null;
  revision: number;
}

interface PartRow {
  id: string;
  external_part_id: string;
  part_number: number;
  title: string;
  duration_seconds: number;
  revision: number;
  furthest_seconds: number | null;
  watched_seconds: number | null;
  last_seconds: number | null;
  completed: number | null;
  completed_at_ms: number | null;
  last_observed_at_ms: number | null;
  progress_revision: number | null;
}

function iso(value: number | null): string | null {
  return value === null ? null : epochMillisecondsToIso(value);
}

function mapProgress(row: ProgressRow): LearningProgress {
  return {
    furthestPartId: row.furthest_part_id,
    furthestSeconds: row.furthest_seconds,
    resumePartId: row.resume_part_id,
    resumeSeconds: row.resume_seconds,
    completed: row.completed === 1,
    completedAt: iso(row.completed_at_ms),
    lastObservedAt: iso(row.last_observed_at_ms),
    manualOverrideAt: iso(row.manual_override_at_ms),
    revision: row.revision,
  };
}

function mapPartProgress(row: PartRow): LearningPartProgress | null {
  return row.progress_revision === null
    ? null
    : {
        furthestSeconds: row.furthest_seconds ?? 0,
        watchedSeconds: row.watched_seconds ?? 0,
        lastSeconds: row.last_seconds ?? 0,
        completed: row.completed === 1,
        completedAt: iso(row.completed_at_ms),
        lastObservedAt: iso(row.last_observed_at_ms),
        revision: row.progress_revision,
      };
}

function mapPart(row: PartRow): LearningPart {
  return {
    id: row.id,
    externalPartId: row.external_part_id,
    partNumber: row.part_number,
    title: row.title,
    durationSeconds: row.duration_seconds,
    progress: mapPartProgress(row),
    revision: row.revision,
  };
}

export class LearningResourceReader {
  public constructor(private readonly database: DatabaseSync) {}

  public list(): LearningResource[] {
    const rows = this.database
      .prepare(
        'SELECT id FROM learning_resources WHERE deleted_at_ms IS NULL ORDER BY updated_at_ms DESC, id',
      )
      .all() as Array<{ id: string }>;
    return rows.map(({ id }) => this.findRequired(id));
  }

  public find(id: string): LearningResource | undefined {
    const row = this.database
      .prepare(
        `SELECT id, external_id, source_url, title, cover_url, uploader_name,
                duration_seconds, revision
         FROM learning_resources
         WHERE id = ? AND deleted_at_ms IS NULL AND external_id IS NOT NULL`,
      )
      .get(id) as ResourceRow | undefined;
    if (row === undefined) return undefined;
    const progressRow = this.database
      .prepare('SELECT * FROM learning_resource_progress WHERE resource_id = ?')
      .get(id) as ProgressRow | undefined;
    if (progressRow === undefined) throw new Error('Learning resource is missing progress');
    return {
      id: row.id,
      externalId: row.external_id,
      sourceUrl: row.source_url,
      title: row.title,
      coverUrl: row.cover_url,
      uploaderName: row.uploader_name,
      durationSeconds: row.duration_seconds,
      parts: this.partRows(id).map(mapPart),
      progress: mapProgress(progressRow),
      revision: row.revision,
    };
  }

  public findByExternalId(externalId: string): LearningResource | undefined {
    const row = this.database
      .prepare(
        `SELECT id FROM learning_resources
         WHERE platform = 'bilibili' AND external_id = ? AND deleted_at_ms IS NULL`,
      )
      .get(externalId) as { id: string } | undefined;
    return row === undefined ? undefined : this.findRequired(row.id);
  }

  public findRequired(id: string): LearningResource {
    const result = this.find(id);
    if (result === undefined) throw new Error('Learning resource write did not produce an entity');
    return result;
  }

  private partRows(resourceId: string): PartRow[] {
    return this.database
      .prepare(
        `SELECT p.id, p.external_part_id, p.part_number, p.title, p.duration_seconds, p.revision,
                progress.furthest_seconds, progress.watched_seconds, progress.last_seconds,
                progress.completed, progress.completed_at_ms,
                progress.last_observed_at_ms, progress.revision AS progress_revision
         FROM learning_parts p LEFT JOIN learning_part_progress progress ON progress.part_id = p.id
         WHERE p.resource_id = ? AND p.deleted_at_ms IS NULL ORDER BY p.part_number, p.id`,
      )
      .all(resourceId) as unknown as PartRow[];
  }
}
