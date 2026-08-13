import type { LearningSeries } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

import { withTransaction } from '../../db/transaction.js';

interface SeriesRow {
  id: string;
  name: string;
  revision: number;
}

export class LearningSeriesRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public list(): LearningSeries[] {
    const rows = this.database
      .prepare(
        `SELECT id, name, revision FROM learning_series
         WHERE deleted_at_ms IS NULL ORDER BY created_at_ms, id`,
      )
      .all() as unknown as SeriesRow[];
    return rows.map((row) => this.map(row));
  }

  public find(id: string): LearningSeries | undefined {
    const row = this.database
      .prepare(
        `SELECT id, name, revision FROM learning_series
         WHERE id = ? AND deleted_at_ms IS NULL`,
      )
      .get(id) as SeriesRow | undefined;
    return row === undefined ? undefined : this.map(row);
  }

  public insert(id: string, name: string, now: number): LearningSeries {
    this.database
      .prepare(
        `INSERT INTO learning_series (id, name, created_at_ms, updated_at_ms, revision)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .run(id, name, now, now);
    return this.required(id);
  }

  public update(
    id: string,
    revision: number,
    name: string,
    now: number,
  ): LearningSeries | undefined {
    const result = this.database
      .prepare(
        `UPDATE learning_series SET name = ?, updated_at_ms = ?, revision = revision + 1
         WHERE id = ? AND revision = ? AND deleted_at_ms IS NULL`,
      )
      .run(name, now, id, revision);
    return result.changes === 0 ? undefined : this.required(id);
  }

  public replaceItems(
    id: string,
    revision: number,
    resourceIds: readonly string[],
    now: number,
  ): LearningSeries | undefined {
    return withTransaction(this.database, () => {
      const updated = this.database
        .prepare(
          `UPDATE learning_series SET updated_at_ms = ?, revision = revision + 1
           WHERE id = ? AND revision = ? AND deleted_at_ms IS NULL`,
        )
        .run(now, id, revision);
      if (updated.changes === 0) return undefined;
      this.database.prepare('DELETE FROM learning_series_items WHERE series_id = ?').run(id);
      const insert = this.database.prepare(
        `INSERT INTO learning_series_items (series_id, resource_id, position, created_at_ms)
         VALUES (?, ?, ?, ?)`,
      );
      resourceIds.forEach((resourceId, position) => insert.run(id, resourceId, position, now));
      return this.required(id);
    });
  }

  public appendResource(id: string, resourceId: string, now: number): LearningSeries | undefined {
    return withTransaction(this.database, () => {
      const current = this.find(id);
      if (current === undefined) return undefined;
      if (!current.resourceIds.includes(resourceId)) {
        this.database
          .prepare(
            `INSERT INTO learning_series_items (series_id, resource_id, position, created_at_ms)
             VALUES (?, ?, ?, ?)`,
          )
          .run(id, resourceId, current.resourceIds.length, now);
        this.database
          .prepare(
            `UPDATE learning_series SET updated_at_ms = ?, revision = revision + 1 WHERE id = ?`,
          )
          .run(now, id);
      }
      return this.required(id);
    });
  }

  public softDelete(id: string, revision: number, now: number): boolean {
    return (
      this.database
        .prepare(
          `UPDATE learning_series SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
           WHERE id = ? AND revision = ? AND deleted_at_ms IS NULL`,
        )
        .run(now, now, id, revision).changes === 1
    );
  }

  private map(row: SeriesRow): LearningSeries {
    const items = this.database
      .prepare(
        `SELECT resource_id FROM learning_series_items
         WHERE series_id = ? ORDER BY position`,
      )
      .all(row.id) as Array<{ resource_id: string }>;
    return {
      id: row.id,
      name: row.name,
      revision: row.revision,
      resourceIds: items.map(({ resource_id }) => resource_id),
    };
  }

  private required(id: string): LearningSeries {
    const result = this.find(id);
    if (result === undefined) throw new Error('Learning series write did not produce an entity');
    return result;
  }
}
