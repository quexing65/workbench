import { randomUUID } from 'node:crypto';
import {
  LearningObservationConflictError,
  mergeLearningObservation,
  normalizeBiliUrl,
  type ImportLearningResourceInput,
  type LearningImportResult,
  type LearningResource,
  type ObserveLearningProgressInput,
} from '@workbench/shared';

import {
  DomainConflictError,
  DomainValidationError,
  ExternalServiceError,
  ResourceNotFoundError,
  RevisionConflictError,
} from '../domain-errors.js';
import type { BiliClient } from './bili-client.js';
import type { LearningResourceRepository } from './resource-repository.js';
import type { LearningSeriesRepository } from './series-repository.js';

export class LearningService {
  public constructor(
    private readonly resources: LearningResourceRepository,
    private readonly series: LearningSeriesRepository,
    private readonly bili: BiliClient,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  public list(): LearningResource[] {
    return this.resources.list();
  }

  public find(id: string): LearningResource {
    return this.required(id);
  }

  public async import(input: ImportLearningResourceInput): Promise<LearningImportResult> {
    if (input.seriesId !== null && this.series.find(input.seriesId) === undefined) {
      throw new ResourceNotFoundError('LEARNING_SERIES_NOT_FOUND', '学习系列不存在');
    }
    let normalized;
    try {
      normalized = normalizeBiliUrl(input.url);
    } catch (error) {
      throw new DomainValidationError('url', error instanceof Error ? error.message : '链接无效');
    }
    const requestedUrl = normalized.url;
    if (normalized.kind === 'short') {
      try {
        const resolved = await this.bili.resolveShortUrl(normalized.url);
        normalized = resolved;
      } catch (error) {
        if (error instanceof ExternalServiceError && error.code !== 'BILI_REDIRECT_BLOCKED') {
          return {
            kind: 'unresolved',
            unresolved: this.resources.unresolved(
              normalized.url,
              normalized.partNumber,
              this.now(),
              this.createId(),
            ),
          };
        }
        throw error;
      }
    }
    if (normalized.bvid === null) {
      throw new DomainValidationError('url', '短链未解析为视频');
    }
    const metadata = await this.bili.getVideo(normalized.bvid);
    const resource = this.resources.upsertMetadata(metadata, this.now(), this.createId);
    if (input.seriesId !== null) {
      if (this.series.appendResource(input.seriesId, resource.id, this.now()) === undefined) {
        throw new ResourceNotFoundError('LEARNING_SERIES_NOT_FOUND', '学习系列不存在');
      }
    }
    this.resources.resolveUnresolved(requestedUrl, resource.id, this.now());
    return { kind: 'resource', resource };
  }

  public observe(id: string, input: ObserveLearningProgressInput): LearningResource {
    const current = this.required(id);
    if (current.progress.revision !== input.revision) {
      throw new RevisionConflictError(current);
    }
    const observedPart = current.parts.find((part) => part.id === input.partId);
    if (observedPart === undefined) {
      throw new DomainValidationError('partId', '分P不属于该学习资源');
    }
    let merged;
    try {
      merged = mergeLearningObservation(
        current.parts,
        current.progress,
        observedPart.progress,
        input,
      );
    } catch (error) {
      if (error instanceof LearningObservationConflictError) {
        throw new DomainConflictError('OBSERVATION_CONFLICT', error.message);
      }
      if (error instanceof RangeError) {
        throw new DomainValidationError('seconds', error.message);
      }
      throw error;
    }
    if (!merged.changed) return current;
    const updated = this.resources.updateObservation(
      id,
      input.revision,
      input.partId,
      { progress: merged.progress, partProgress: merged.partProgress },
      this.now(),
    );
    if (updated === undefined) throw new RevisionConflictError(this.required(id));
    return updated;
  }

  public manual(id: string, revision: number, action: 'complete' | 'reset'): LearningResource {
    const current = this.required(id);
    if (current.progress.revision !== revision) throw new RevisionConflictError(current);
    const updated = this.resources.manualProgress(id, revision, action, this.now());
    if (updated === undefined) throw new RevisionConflictError(this.required(id));
    return updated;
  }

  public delete(id: string, revision: number): void {
    const current = this.required(id);
    if (current.revision !== revision) throw new RevisionConflictError(current);
    if (!this.resources.softDelete(id, revision, this.now())) {
      throw new RevisionConflictError(this.required(id));
    }
  }

  private required(id: string): LearningResource {
    const resource = this.resources.find(id);
    if (resource === undefined) {
      throw new ResourceNotFoundError('LEARNING_RESOURCE_NOT_FOUND', '学习资源不存在');
    }
    return resource;
  }
}
