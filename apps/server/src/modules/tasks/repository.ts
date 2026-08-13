import type { DailyTask, TaskListItem, TaskStatus } from '@workbench/shared';
import type { DatabaseSync, StatementSync } from 'node:sqlite';

interface DailyTaskRow {
  id: string;
  title: string;
  description: string;
  task_date: string;
  status: TaskStatus;
  revision: number;
}

interface RecurringRow {
  template_id: string;
  title: string;
  description: string;
  status: TaskStatus | null;
  revision: number | null;
}

function daily(row: DailyTaskRow): DailyTask {
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

function recurring(row: RecurringRow, date: string): TaskListItem {
  return {
    kind: 'recurring',
    id: `${row.template_id}:${date}`,
    templateId: row.template_id,
    title: row.title,
    description: row.description,
    date,
    status: row.status ?? 'active',
    revision: row.revision ?? 0,
  };
}

export interface DailyTaskWrite {
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly status: TaskStatus;
}

export class TaskRepository {
  private readonly findStatement: StatementSync;

  public constructor(private readonly database: DatabaseSync) {
    this.findStatement = database.prepare(`
      SELECT id, title, description, task_date, status, revision
      FROM tasks WHERE id = ? AND deleted_at_ms IS NULL
    `);
  }

  public list(date: string): TaskListItem[] {
    const dailyRows = this.database
      .prepare(
        `
        SELECT id, title, description, task_date, status, revision
        FROM tasks WHERE task_date = ? AND deleted_at_ms IS NULL
        ORDER BY created_at_ms, id
      `,
      )
      .all(date) as unknown as DailyTaskRow[];
    const recurringRows = this.database
      .prepare(
        `
        SELECT t.id AS template_id, t.title, t.description, o.status, o.revision
        FROM recurring_task_templates t
        LEFT JOIN recurring_task_occurrences o
          ON o.template_id = t.id AND o.occurrence_date = ?
        WHERE t.deleted_at_ms IS NULL AND t.start_date <= ?
          AND (t.end_date IS NULL OR t.end_date >= ?)
        ORDER BY t.created_at_ms, t.id
      `,
      )
      .all(date, date, date) as unknown as RecurringRow[];
    return [...dailyRows.map(daily), ...recurringRows.map((row) => recurring(row, date))];
  }

  public find(id: string): DailyTask | undefined {
    const row = this.findStatement.get(id) as DailyTaskRow | undefined;
    return row === undefined ? undefined : daily(row);
  }

  public insert(id: string, input: DailyTaskWrite, now: number): DailyTask {
    this.database
      .prepare(
        `
        INSERT INTO tasks (
          id, title, description, task_date, status, completed_at_ms, cancelled_at_ms,
          created_at_ms, updated_at_ms, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      )
      .run(
        id,
        input.title,
        input.description,
        input.date,
        input.status,
        input.status === 'completed' ? now : null,
        input.status === 'cancelled' ? now : null,
        now,
        now,
      );
    return this.findRequired(id);
  }

  public update(
    id: string,
    revision: number,
    input: DailyTaskWrite,
    now: number,
  ): DailyTask | undefined {
    const result = this.database
      .prepare(
        `
        UPDATE tasks SET title = ?, description = ?, task_date = ?, status = ?,
          completed_at_ms = ?, cancelled_at_ms = ?, updated_at_ms = ?, revision = revision + 1
        WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?
      `,
      )
      .run(
        input.title,
        input.description,
        input.date,
        input.status,
        input.status === 'completed' ? now : null,
        input.status === 'cancelled' ? now : null,
        now,
        id,
        revision,
      );
    return result.changes === 0 ? undefined : this.findRequired(id);
  }

  public softDelete(id: string, revision: number, now: number): boolean {
    return (
      this.database
        .prepare(
          `
          UPDATE tasks SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
          WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?
        `,
        )
        .run(now, now, id, revision).changes === 1
    );
  }

  private findRequired(id: string): DailyTask {
    const task = this.find(id);
    if (task === undefined) {
      throw new Error('Task write did not produce an entity');
    }
    return task;
  }
}
