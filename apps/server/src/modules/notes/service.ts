import { randomUUID } from 'node:crypto';
import type { CreateNoteInput, Note, UpdateNoteInput } from '@workbench/shared';

import {
  DomainValidationError,
  ResourceNotFoundError,
  RevisionConflictError,
} from '../domain-errors.js';
import type { NoteListOptions, NoteRepository } from './repository.js';

export class NoteService {
  public constructor(
    private readonly repository: NoteRepository,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  public list(options: NoteListOptions): { items: Note[]; nextCursor: string | null } {
    if (options.cursor !== undefined && !/^[01]:[0-9]+:[0-9a-f-]+$/iu.test(options.cursor)) {
      throw new DomainValidationError('cursor', '分页游标无效');
    }
    const rows = this.repository.list(options);
    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last !== undefined
          ? `${last.pinned ? 1 : 0}:${Date.parse(last.updatedAt)}:${last.id}`
          : null,
    };
  }

  public create(input: CreateNoteInput): Note {
    return this.repository.insert(this.createId(), input.content, input.pinned, this.now());
  }

  public update(id: string, input: UpdateNoteInput): Note {
    const current = this.required(id);
    if (current.revision !== input.revision) throw new RevisionConflictError(current);
    const updated = this.repository.update(
      id,
      input.revision,
      input.content ?? current.content,
      input.pinned ?? current.pinned,
      this.now(),
    );
    if (updated === undefined) throw new RevisionConflictError(this.required(id));
    return updated;
  }

  public delete(id: string, revision: number): void {
    const current = this.required(id);
    if (current.revision !== revision) throw new RevisionConflictError(current);
    if (!this.repository.softDelete(id, revision, this.now())) {
      throw new RevisionConflictError(this.required(id));
    }
  }

  private required(id: string): Note {
    const result = this.repository.find(id);
    if (result === undefined) throw new ResourceNotFoundError('NOTE_NOT_FOUND', '小记不存在');
    return result;
  }
}
