import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, DailyTask, TaskListItem, UpdateTaskInput } from '@workbench/shared';

import { ResourceNotFoundError, RevisionConflictError } from '../domain-errors.js';
import type { TaskRepository } from './repository.js';

export class TaskService {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  public list(date: string): TaskListItem[] {
    return this.repository.list(date);
  }

  public listOverdue(date: string): DailyTask[] {
    return this.repository.listOverdue(date);
  }

  public create(input: CreateTaskInput): DailyTask {
    return this.repository.insert(this.createId(), { ...input, status: 'active' }, this.now());
  }

  public update(id: string, input: UpdateTaskInput): DailyTask {
    const current = this.required(id);
    if (current.revision !== input.revision) {
      throw new RevisionConflictError(current);
    }
    const updated = this.repository.update(
      id,
      input.revision,
      {
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        date: input.date ?? current.date,
        status: input.status ?? current.status,
      },
      this.now(),
    );
    if (updated === undefined) {
      throw new RevisionConflictError(this.required(id));
    }
    return updated;
  }

  public delete(id: string, revision: number): void {
    const current = this.required(id);
    if (current.revision !== revision) {
      throw new RevisionConflictError(current);
    }
    if (!this.repository.softDelete(id, revision, this.now())) {
      throw new RevisionConflictError(this.required(id));
    }
  }

  private required(id: string): DailyTask {
    const task = this.repository.find(id);
    if (task === undefined) {
      throw new ResourceNotFoundError('TASK_NOT_FOUND', '任务不存在');
    }
    return task;
  }
}
