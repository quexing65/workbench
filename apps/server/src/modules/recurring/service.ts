import { randomUUID } from 'node:crypto';
import type {
  CreateRecurringTaskInput,
  RecurringTask,
  UpdateOccurrenceInput,
  UpdateRecurringTaskInput,
} from '@workbench/shared';

import {
  DomainValidationError,
  ResourceNotFoundError,
  RevisionConflictError,
} from '../domain-errors.js';
import type { RecurringRepository } from './repository.js';

export class RecurringService {
  public constructor(
    private readonly repository: RecurringRepository,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  public list(): RecurringTask[] {
    return this.repository.list();
  }

  public create(input: CreateRecurringTaskInput): RecurringTask {
    return this.repository.insert(this.createId(), input, this.now());
  }

  public update(id: string, input: UpdateRecurringTaskInput): RecurringTask {
    const current = this.required(id);
    if (current.revision !== input.revision) throw new RevisionConflictError(current);
    const next = {
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      startDate: input.startDate ?? current.startDate,
      endDate: input.endDate === undefined ? current.endDate : input.endDate,
    };
    if (next.endDate !== null && next.endDate < next.startDate) {
      throw new DomainValidationError('endDate', '结束日期不能早于开始日期');
    }
    const updated = this.repository.update(id, input.revision, next, this.now());
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

  public updateOccurrence(id: string, date: string, input: UpdateOccurrenceInput) {
    const template = this.required(id);
    if (date < template.startDate || (template.endDate !== null && date > template.endDate)) {
      throw new ResourceNotFoundError('OCCURRENCE_NOT_FOUND', '该日期不在固定任务范围内');
    }
    const current = this.repository.occurrence(id, date);
    if (current === undefined) {
      if (input.revision !== 0) throw new RevisionConflictError({ revision: 0, status: 'active' });
      const inserted = this.repository.insertOccurrence(id, date, input.status, this.now());
      if (inserted === undefined) {
        throw new RevisionConflictError(
          this.repository.occurrence(id, date) ?? { revision: 0, status: 'active' },
        );
      }
      return inserted;
    }
    if (current.revision !== input.revision) throw new RevisionConflictError(current);
    const updated = this.repository.updateOccurrence(
      id,
      date,
      input.revision,
      input.status,
      this.now(),
    );
    if (updated === undefined) {
      throw new RevisionConflictError(this.repository.occurrence(id, date) ?? current);
    }
    return updated;
  }

  private required(id: string): RecurringTask {
    const result = this.repository.find(id);
    if (result === undefined) {
      throw new ResourceNotFoundError('RECURRING_TASK_NOT_FOUND', '固定任务不存在');
    }
    return result;
  }
}
