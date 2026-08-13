import { epochMillisecondsToIso, type Note } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

interface NoteRow {
  id: string;
  content: string;
  pinned: number;
  created_at_ms: number;
  updated_at_ms: number;
  revision: number;
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

export interface NoteListOptions {
  readonly query?: string;
  readonly pinned?: boolean;
  readonly cursor?: string;
  readonly limit: number;
}

export class NoteRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public list(options: NoteListOptions): Note[] {
    const filters = ['deleted_at_ms IS NULL'];
    const parameters: Array<string | number> = [];
    if (options.query !== undefined && options.query !== '') {
      filters.push('instr(lower(content), lower(?)) > 0');
      parameters.push(options.query);
    }
    if (options.pinned !== undefined) {
      filters.push('pinned = ?');
      parameters.push(options.pinned ? 1 : 0);
    }
    if (options.cursor !== undefined) {
      const [pinned, time, id] = options.cursor.split(':', 3);
      filters.push(`(
        pinned < ? OR
        (pinned = ? AND updated_at_ms < ?) OR
        (pinned = ? AND updated_at_ms = ? AND id < ?)
      )`);
      parameters.push(
        Number(pinned),
        Number(pinned),
        Number(time),
        Number(pinned),
        Number(time),
        id ?? '',
      );
    }
    parameters.push(options.limit + 1);
    const rows = this.database
      .prepare(
        `
        SELECT id, content, pinned, created_at_ms, updated_at_ms, revision
        FROM notes WHERE ${filters.join(' AND ')}
        ORDER BY pinned DESC, updated_at_ms DESC, id DESC LIMIT ?
      `,
      )
      .all(...parameters) as unknown as NoteRow[];
    return rows.map(note);
  }

  public find(id: string): Note | undefined {
    const row = this.database
      .prepare(
        `
        SELECT id, content, pinned, created_at_ms, updated_at_ms, revision
        FROM notes WHERE id = ? AND deleted_at_ms IS NULL
      `,
      )
      .get(id) as NoteRow | undefined;
    return row === undefined ? undefined : note(row);
  }

  public insert(id: string, content: string, pinned: boolean, now: number): Note {
    this.database
      .prepare(
        `
        INSERT INTO notes (id, content, pinned, created_at_ms, updated_at_ms, revision)
        VALUES (?, ?, ?, ?, ?, 1)
      `,
      )
      .run(id, content, pinned ? 1 : 0, now, now);
    return this.findRequired(id);
  }

  public update(
    id: string,
    revision: number,
    content: string,
    pinned: boolean,
    now: number,
  ): Note | undefined {
    const result = this.database
      .prepare(
        `
        UPDATE notes SET content = ?, pinned = ?, updated_at_ms = ?, revision = revision + 1
        WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?
      `,
      )
      .run(content, pinned ? 1 : 0, now, id, revision);
    return result.changes === 0 ? undefined : this.findRequired(id);
  }

  public softDelete(id: string, revision: number, now: number): boolean {
    return (
      this.database
        .prepare(
          `
          UPDATE notes SET deleted_at_ms = ?, updated_at_ms = ?, revision = revision + 1
          WHERE id = ? AND deleted_at_ms IS NULL AND revision = ?
        `,
        )
        .run(now, now, id, revision).changes === 1
    );
  }

  private findRequired(id: string): Note {
    const result = this.find(id);
    if (result === undefined) throw new Error('Note write did not produce an entity');
    return result;
  }
}
