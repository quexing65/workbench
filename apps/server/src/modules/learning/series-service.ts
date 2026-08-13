import { randomUUID } from 'node:crypto';
import type {
  CreateLearningSeriesInput,
  LearningSeries,
  ReplaceLearningSeriesItemsInput,
  UpdateLearningSeriesInput,
} from '@workbench/shared';

import {
  DomainValidationError,
  ResourceNotFoundError,
  RevisionConflictError,
} from '../domain-errors.js';
import type { LearningResourceRepository } from './resource-repository.js';
import type { LearningSeriesRepository } from './series-repository.js';

export class LearningSeriesService {
  public constructor(
    private readonly series: LearningSeriesRepository,
    private readonly resources: LearningResourceRepository,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  public list(): LearningSeries[] {
    return this.series.list();
  }

  public create(input: CreateLearningSeriesInput): LearningSeries {
    return this.series.insert(this.createId(), input.name, this.now());
  }

  public update(id: string, input: UpdateLearningSeriesInput): LearningSeries {
    const current = this.required(id);
    if (current.revision !== input.revision) throw new RevisionConflictError(current);
    const updated = this.series.update(id, input.revision, input.name, this.now());
    if (updated === undefined) throw new RevisionConflictError(this.required(id));
    return updated;
  }

  public replaceItems(id: string, input: ReplaceLearningSeriesItemsInput): LearningSeries {
    const current = this.required(id);
    if (current.revision !== input.revision) throw new RevisionConflictError(current);
    const missing = input.resourceIds.find(
      (resourceId) => this.resources.find(resourceId) === undefined,
    );
    if (missing !== undefined) {
      throw new DomainValidationError('resourceIds', '系列中包含不存在的学习资源');
    }
    const updated = this.series.replaceItems(id, input.revision, input.resourceIds, this.now());
    if (updated === undefined) throw new RevisionConflictError(this.required(id));
    return updated;
  }

  public delete(id: string, revision: number): void {
    const current = this.required(id);
    if (current.revision !== revision) throw new RevisionConflictError(current);
    if (!this.series.softDelete(id, revision, this.now())) {
      throw new RevisionConflictError(this.required(id));
    }
  }

  private required(id: string): LearningSeries {
    const result = this.series.find(id);
    if (result === undefined) {
      throw new ResourceNotFoundError('LEARNING_SERIES_NOT_FOUND', '学习系列不存在');
    }
    return result;
  }
}
