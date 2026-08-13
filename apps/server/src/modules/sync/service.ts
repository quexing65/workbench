import { randomUUID } from 'node:crypto';

import type { LearningSyncRun } from '@workbench/shared';

import type { BiliSessionClient, BiliHistoryObservation } from '../bili/session-client.js';
import {
  DomainConflictError,
  ExternalServiceError,
  ResourceNotFoundError,
} from '../domain-errors.js';
import type { BiliCredentialStore } from '../credentials/store.js';
import { isSafeCredential } from '../credentials/service.js';
import type { LearningResourceRepository } from '../learning/resource-repository.js';
import type { LearningService } from '../learning/service.js';
import type { SyncRunRepository } from './repository.js';

type Scheduler = (task: () => void) => void;

export class LearningSyncService {
  private active = false;

  public constructor(
    private readonly runs: SyncRunRepository,
    private readonly credentials: BiliCredentialStore,
    private readonly bili: BiliSessionClient,
    private readonly resources: LearningResourceRepository,
    private readonly learning: LearningService,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
    private readonly schedule: Scheduler = queueMicrotask,
  ) {
    this.runs.recoverInterrupted(this.now());
  }

  public async start(pages: number): Promise<string> {
    if (this.active) {
      throw new DomainConflictError('SYNC_ALREADY_RUNNING', '已有 B站同步正在运行');
    }
    this.active = true;
    try {
      const sessdata = await this.credentials.read();
      if (sessdata === null) {
        throw new DomainConflictError('BILI_CREDENTIAL_REQUIRED', '请先连接 B站登录态');
      }
      if (!isSafeCredential(sessdata)) {
        throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态格式无效', 401);
      }
      const id = this.createId();
      this.runs.create(id, pages, this.now());
      this.schedule(() => void this.execute(id, pages, sessdata));
      return id;
    } catch (error) {
      this.active = false;
      throw error;
    }
  }

  public find(id: string): LearningSyncRun {
    const run = this.runs.find(id);
    if (run === undefined) throw new ResourceNotFoundError('SYNC_RUN_NOT_FOUND', '同步记录不存在');
    return run;
  }

  private async execute(id: string, pages: number, sessdata: string): Promise<void> {
    try {
      this.runs.markRunning(id, this.now());
      const history = await this.bili.getHistory(sessdata, pages);
      let updated = 0;
      for (const observation of history) updated += this.apply(observation);
      this.runs.succeed(id, history.length, updated, this.now());
    } catch (error) {
      try {
        this.runs.fail(id, safeCode(error), this.now());
      } catch {
        // The database may already be closed during process shutdown.
      }
    } finally {
      this.active = false;
    }
  }

  private apply(observation: BiliHistoryObservation): number {
    const resource = this.resources.findByExternalId(observation.bvid);
    if (resource === undefined || observation.progressSeconds < -1) return 0;
    const part = resource.parts.find(({ partNumber }) => partNumber === observation.partNumber);
    if (part === undefined) return 0;
    const seconds =
      observation.progressSeconds === -1
        ? part.durationSeconds
        : Math.min(observation.progressSeconds, part.durationSeconds);
    if (
      resource.progress.lastObservedAt === observation.observedAt &&
      resource.progress.resumePartId === part.id &&
      resource.progress.resumeSeconds === seconds
    ) {
      return 0;
    }
    const before = resource.progress.revision;
    const result = this.learning.observe(resource.id, {
      revision: before,
      partId: part.id,
      seconds,
      observedAt: observation.observedAt,
      source: 'sync',
    });
    return result.progress.revision === before ? 0 : 1;
  }
}

function safeCode(error: unknown): string {
  if (error instanceof ExternalServiceError) return error.code;
  if (error instanceof DomainConflictError) return error.code;
  return 'SYNC_FAILED';
}
