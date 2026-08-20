import { epochMillisecondsToIso, type Note, type ResumableLearning } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

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

interface SeriesLearningPositionRow {
  series_id: string | null;
  series_name: string;
  duration_seconds: number;
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

  /**
   * 按系列统计「当前观看时刻距合集开头」的秒数，与回顾区间无关：
   * 每个资源取「续播分P之前的分P全长 + resume 秒数」，手动完成的资源按全长计；
   * 系列值为成员资源之和，未归入任何系列的资源计入「未分类」。
   */
  public learningPositionBySeries(): Array<{
    seriesId: string | null;
    seriesName: string;
    durationSeconds: number;
  }> {
    const rows = this.database
      .prepare(
        `WITH ranked_series AS (
           SELECT item.resource_id, series.id AS series_id, series.name AS series_name,
                  row_number() OVER (
                    PARTITION BY item.resource_id ORDER BY series.created_at_ms, series.id
                  ) AS rank
           FROM learning_series_items item
           JOIN learning_series series ON series.id = item.series_id
           WHERE series.deleted_at_ms IS NULL
         ),
         resource_position AS (
           SELECT progress.resource_id,
                  CASE
                    WHEN progress.completed = 1 THEN (
                      SELECT COALESCE(SUM(part.duration_seconds), 0)
                      FROM learning_parts part
                      WHERE part.resource_id = progress.resource_id
                        AND part.deleted_at_ms IS NULL
                    )
                    ELSE progress.resume_seconds + COALESCE((
                      SELECT SUM(prev.duration_seconds)
                      FROM learning_parts prev
                      WHERE prev.resource_id = progress.resource_id
                        AND prev.deleted_at_ms IS NULL
                        AND prev.part_number < resume.part_number
                    ), 0)
                  END AS position_seconds
           FROM learning_resource_progress progress
           LEFT JOIN learning_parts resume ON resume.id = progress.resume_part_id
         )
         SELECT ranked.series_id,
                COALESCE(ranked.series_name, '未分类') AS series_name,
                SUM(position.position_seconds) AS duration_seconds
         FROM resource_position position
         JOIN learning_resources resource ON resource.id = position.resource_id
           AND resource.deleted_at_ms IS NULL
         LEFT JOIN ranked_series ranked ON ranked.resource_id = position.resource_id
           AND ranked.rank = 1
         GROUP BY ranked.series_id, ranked.series_name
         HAVING duration_seconds > 0
         ORDER BY duration_seconds DESC, series_name`,
      )
      .all() as unknown as SeriesLearningPositionRow[];
    return rows.map((row) => ({
      seriesId: row.series_id,
      seriesName: row.series_name,
      durationSeconds: Number(row.duration_seconds),
    }));
  }
}
