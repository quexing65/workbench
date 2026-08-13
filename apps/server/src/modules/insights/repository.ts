import {
  epochMillisecondsToIso,
  type DailyTask,
  type Note,
  type ResumableLearning,
} from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

interface DailyTaskRow {
  id: string;
  title: string;
  description: string;
  task_date: string;
  status: DailyTask['status'];
  revision: number;
}

interface NoteRow {
  id: string;
  content: string;
  pinned: number;
  created_at_ms: number;
  updated_at_ms: number;
  revision: number;
}

interface LearningRow {
  id: string;
  title: string;
  source_url: string;
  cover_url: string | null;
  resume_part_id: string;
  resume_part_title: string;
  resume_seconds: number;
}

function task(row: DailyTaskRow): DailyTask {
  return {
    kind: 'daily',
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.task_date,
    status: row.status,
    revision: row.revision,
  };
}

function note(row: NoteRow): Note {
  return {
    id: row.id,
    content: row.content,
    pinned: row.pinned === 1,
    createdAt: epochMillisecondsToIso(row.created_at_ms),
    updatedAt: epochMillisecondsToIso(row.updated_at_ms),
    revision: row.revision,
  };
}

function learning(row: LearningRow): ResumableLearning {
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    coverUrl: row.cover_url,
    resumePartId: row.resume_part_id,
    resumePartTitle: row.resume_part_title,
    resumeSeconds: row.resume_seconds,
  };
}

export class InsightRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public listOverdue(date: string): DailyTask[] {
    const rows = this.database
      .prepare(
        `SELECT id, title, description, task_date, status, revision
         FROM tasks
         WHERE task_date < ? AND status = 'active' AND deleted_at_ms IS NULL
         ORDER BY task_date, created_at_ms, id`,
      )
      .all(date) as unknown as DailyTaskRow[];
    return rows.map(task);
  }

  public listRecentNotes(limit: number): Note[] {
    const rows = this.database
      .prepare(
        `SELECT id, content, pinned, created_at_ms, updated_at_ms, revision
         FROM notes WHERE deleted_at_ms IS NULL
         ORDER BY updated_at_ms DESC, id DESC LIMIT ?`,
      )
      .all(limit) as unknown as NoteRow[];
    return rows.map(note);
  }

  public nextLearning(): ResumableLearning | null {
    const row = this.database
      .prepare(
        `WITH next_progress AS (
           SELECT resource_id, resume_part_id, resume_seconds
           FROM learning_resource_progress
           WHERE completed = 0 AND resume_part_id IS NOT NULL
           ORDER BY COALESCE(last_observed_at_ms, updated_at_ms) DESC, resource_id
           LIMIT 1
         )
         SELECT r.id, r.title, r.source_url, r.cover_url,
                p.resume_part_id, part.title AS resume_part_title, p.resume_seconds
         FROM next_progress p
         JOIN learning_resources r ON r.id = p.resource_id
         JOIN learning_parts part ON part.id = p.resume_part_id
         WHERE r.deleted_at_ms IS NULL AND part.deleted_at_ms IS NULL`,
      )
      .get() as LearningRow | undefined;
    return row === undefined ? null : learning(row);
  }

  public learningActivityCounts(from: string, to: string): ReadonlyMap<string, number> {
    const rows = this.database
      .prepare(
        `SELECT strftime('%Y-%m-%d', last_observed_at_ms / 1000, 'unixepoch', '+8 hours') AS date,
                count(*) AS count
         FROM learning_part_progress
         WHERE last_observed_at_ms >=
           CAST(strftime('%s', ? || ' 00:00:00', '-8 hours') AS INTEGER) * 1000
           AND last_observed_at_ms <
           CAST(strftime('%s', date(?, '+1 day') || ' 00:00:00', '-8 hours') AS INTEGER) * 1000
         GROUP BY date`,
      )
      .all(from, to) as unknown as Array<{ date: string; count: number }>;
    return new Map(rows.map((row) => [row.date, row.count]));
  }
}
