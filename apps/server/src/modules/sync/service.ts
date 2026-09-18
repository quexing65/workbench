import { randomUUID } from 'node:crypto';

import type { LearningSyncRun } from '@workbench/shared';

import type { BiliSessionClient, BiliHistoryObservation } from '../bili/session-client.js';
import {
  DomainConflictError,
  ExternalServiceError,
  ResourceNotFoundError,
} from '../domain-errors.js';
import type { BiliCredentialStore } from '../credentials/store.js';
import { decodeRecord } from '../credentials/credential-record.js';
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
    private readonly ensureFresh: () => Promise<void> = async () => undefined,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
    private readonly schedule: Scheduler = queueMicrotask,
  ) {
    this.runs.recoverInterrupted(this.now());
  }

  public async start(resourceId: string, pages: number): Promise<string> {
    if (this.active) {
      throw new DomainConflictError('SYNC_ALREADY_RUNNING', '已有 B站同步正在运行');
    }
    this.active = true;
    try {
      const resource = this.resources.find(resourceId);
      if (resource === undefined) {
        throw new ResourceNotFoundError('LEARNING_RESOURCE_NOT_FOUND', '学习资源不存在');
      }
      const sessdata = await this.readCredential();
      const id = this.createId();
      this.runs.create(id, pages, this.now());
      this.schedule(() => void this.execute(id, pages, sessdata, resource.id));
      return id;
    } catch (error) {
      this.active = false;
      throw error;
    }
  }

  public async startAll(pages: number): Promise<string> {
    if (this.active) {
      throw new DomainConflictError('SYNC_ALREADY_RUNNING', '已有 B站同步正在运行');
    }
    this.active = true;
    try {
      const sessdata = await this.readCredential();
      const id = this.createId();
      this.runs.create(id, pages, this.now());
      this.schedule(() => void this.executeAll(id, pages, sessdata));
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

  private async readCredential(): Promise<string> {
    // 续期要发生在读取凭据之前：换发后旧 SESSDATA 会被作废，先读拿到的是即将失效的值。
    await this.ensureFresh();
    const record = decodeRecord(await this.credentials.read());
    const sessdata = record?.sessdata;
    if (sessdata === undefined) {
      throw new DomainConflictError('BILI_CREDENTIAL_REQUIRED', '请先连接 B站登录态');
    }
    if (!isSafeCredential(sessdata)) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态格式无效', 401);
    }
    return sessdata;
  }

  private async execute(
    id: string,
    pages: number,
    sessdata: string,
    resourceId: string,
  ): Promise<void> {
    try {
      this.runs.markRunning(id, this.now());
      const resource = this.resources.find(resourceId);
      if (resource === undefined) {
        throw new ResourceNotFoundError('LEARNING_RESOURCE_NOT_FOUND', '学习资源不存在');
      }
      const history = await this.bili.getHistory(sessdata, pages);
      // 合集资源的分集各有独立 BV：按分集 BV 集合匹配；普通视频按资源 BV 匹配
      const matchingHistory =
        resource.biliSeasonId === null
          ? history.filter(
              (observation) => observation.bvid.toLowerCase() === resource.externalId.toLowerCase(),
            )
          : history.filter((observation) =>
              resource.parts.some(
                (part) => part.episodeBvid?.toLowerCase() === observation.bvid.toLowerCase(),
              ),
            );
      let updated = 0;
      for (const observation of matchingHistory) updated += this.apply(resourceId, observation);
      this.runs.succeed(id, matchingHistory.length, updated, this.now());
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

  private async executeAll(
    id: string,
    pages: number,
    sessdata: string,
  ): Promise<void> {
    try {
      this.runs.markRunning(id, this.now());
      const history = await this.bili.getHistory(sessdata, pages);
      const allResources = this.resources.list();
      let totalUpdated = 0;
      for (const resource of allResources) {
        const matching =
          resource.biliSeasonId === null
            ? history.filter(
                (obs) => obs.bvid.toLowerCase() === resource.externalId.toLowerCase(),
              )
            : history.filter((obs) =>
                resource.parts.some(
                  (part) => part.episodeBvid?.toLowerCase() === obs.bvid.toLowerCase(),
                ),
              );
        for (const observation of matching) totalUpdated += this.apply(resource.id, observation);
      }
      this.runs.succeed(id, history.length, totalUpdated, this.now());
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

  private apply(resourceId: string, observation: BiliHistoryObservation): number {
    const resource = this.resources.find(resourceId);
    if (resource === undefined || observation.progressSeconds < -1) return 0;
    // 合集分集按各自的 BV 匹配；多页集的历史进度只精确到页，这里按整集近似（课程合集绝大多数为单页集）
    const part =
      resource.biliSeasonId === null
        ? resource.parts.find(({ partNumber }) => partNumber === observation.partNumber)
        : resource.parts.find(
            ({ episodeBvid }) => episodeBvid?.toLowerCase() === observation.bvid.toLowerCase(),
          );
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
