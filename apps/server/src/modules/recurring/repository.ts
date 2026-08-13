import type { RecurringTask, TaskStatus } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

interface TemplateRow {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  revision: number;
}

interface OccurrenceRow {
  status: TaskStatus;
  revision: number;
}

function template(row: TemplateRow): RecurringTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    revision: row.revision,
  };
}

export interface TemplateWrite {
  readonly title: string;
  readonly description: string;
  readonly startDate: string;
  readonly endDate: string | null;
}

export class RecurringRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public list(): RecurringTask[] {
    return (
      this.database
        .prepare(
          `
          SELECT id, title, description, start_date, end_date, revision
          FROM recurring_task_templates WHERE deleted_at_ms IS NULL
          ORDER BY created_at_ms, id
        `,
        )
        .all() as unknown as TemplateRow[]
    ).map(template);
  }

  public find(id: string): RecurringTask | undefined {
    const row = this.database
      .prepare(
        `
        SELECT id, title, description, start_date, end_date, revision
        FROM recurring_task_templates WHERE id = ? AND deleted_at_ms IS NULL
      `,
      )
      .get(id) as TemplateRow | undefined;
    return row === undefined ? undefined : template(row);
  }

  public insert(id: string, input: TemplateWrite, now: number): RecurringTask {
    this.database
      .prepare(
        `
        INSERT INTO recurring_task_templates (
          id, title, description, start_date, end_date, created_at_ms, updated_at_ms, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `,
      )
      .run(id, input.title, input.description, input.startDate, input.endDate, now, now);
    return this.findRequired(id);
  }

  public update(
    id: string,
    revision: number,
    input: TemplateWrite,
    now: number,
  ): RecurringTask | undefined {
    const result = this.database
      .prepare(
        `
        UPDATE recurring_task_templates
        SET title = ?, description = ?, start_date = ?, end_date = ?,
          updated_at_ms = ?, revision = revision + 1
        WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?
      `,
      )
      .run(input.title, input.description, input.startDate, input.endDate, now, id, revision);
    return result.changes === 0 ? undefined : this.findRequired(id);
  }

  public softDelete(id: string, revision: number, now: number): boolean {
    return (
      this.database
        .prepare(
          `
          UPDATE recurring_task_templates
          SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
          WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?
        `,
        )
        .run(now, now, id, revision).changes === 1
    );
  }

  public occurrence(id: string, date: string): OccurrenceRow | undefined {
    return this.database
      .prepare(
        `
        SELECT status, revision FROM recurring_task_occurrences
        WHERE template_id = ? AND occurrence_date = ?
      `,
      )
      .get(id, date) as OccurrenceRow | undefined;
  }

  public insertOccurrence(
    id: string,
    date: string,
    status: TaskStatus,
    now: number,
  ): OccurrenceRow | undefined {
    const result = this.database
      .prepare(
        `
        INSERT INTO recurring_task_occurrences (
          template_id, occurrence_date, status, completed_at_ms, cancelled_at_ms, updated_at_ms, revision
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT (template_id, occurrence_date) DO NOTHING
      `,
      )
      .run(
        id,
        date,
        status,
        status === 'completed' ? now : null,
        status === 'cancelled' ? now : null,
        now,
      );
    return result.changes === 0 ? undefined : this.occurrenceRequired(id, date);
  }

  public updateOccurrence(
    id: string,
    date: string,
    revision: number,
    status: TaskStatus,
    now: number,
  ): OccurrenceRow | undefined {
    const result = this.database
      .prepare(
        `
        UPDATE recurring_task_occurrences
        SET status = ?, completed_at_ms = ?, cancelled_at_ms = ?,
          updated_at_ms = ?, revision = revision + 1
        WHERE template_id = ? AND occurrence_date = ? AND revision = ?
      `,
      )
      .run(
        status,
        status === 'completed' ? now : null,
        status === 'cancelled' ? now : null,
        now,
        id,
        date,
        revision,
      );
    return result.changes === 0 ? undefined : this.occurrenceRequired(id, date);
  }

  private findRequired(id: string): RecurringTask {
    const result = this.find(id);
    if (result === undefined) throw new Error('Recurring task write did not produce an entity');
    return result;
  }

  private occurrenceRequired(id: string, date: string): OccurrenceRow {
    const result = this.occurrence(id, date);
    if (result === undefined) throw new Error('Occurrence write did not produce an entity');
    return result;
  }
}
