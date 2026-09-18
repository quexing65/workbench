import { randomUUID } from 'node:crypto';
import {
  epochMillisecondsToIso,
  LearningObservationConflictError,
  mergeLearningObservation,
  normalizeBiliUrl,
  type BiliSeasonImportResult,
  type BiliSeasonPreview,
  type ImportLearningResourceInput,
  type LearningImportResult,
  type LearningResource,
  type ObserveLearningProgressInput,
  type RenameLearningResourceInput,
} from '@workbench/shared';

import {
  DomainConflictError,
  DomainValidationError,
  ExternalServiceError,
  ResourceNotFoundError,
  RevisionConflictError,
} from '../domain-errors.js';
import type { BiliClient, BiliSeason, BiliVideoMetadata } from './bili-client.js';
import type { LearningResourceRepository } from './resource-repository.js';
import type { LearningSeriesRepository } from './series-repository.js';

// 合集分集数上限，防止异常响应撑爆导入
const MAX_SEASON_EPISODES = 500;

function toSeasonPreview(season: BiliSeason): BiliSeasonPreview {
  return {
    seasonId: season.seasonId,
    title: season.title,
    episodeCount: season.episodes.length,
    totalDurationSeconds: season.episodes.reduce(
      (total, episode) => total + episode.durationSeconds,
      0,
    ),
  };
}

/** 与卡片同一口径：furthest 之前分P时长和 + furthestSeconds；已完成取整项时长。 */
function overallWatchedSeconds(resource: LearningResource): number {
  if (resource.progress.completed) return resource.durationSeconds;
  const furthestIndex = resource.parts.findIndex(
    (part) => part.id === resource.progress.furthestPartId,
  );
  const watchedBefore = resource.parts
    .slice(0, Math.max(furthestIndex, 0))
    .reduce((sum, part) => sum + part.durationSeconds, 0);
  return watchedBefore + resource.progress.furthestSeconds;
}

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
    if (input.seriesId !== null) this.ensureSeriesExists(input.seriesId);
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
        // 短链跳转到直播间/动态等非视频页时，解析器对跳转目标抛 RangeError；
        // 这是用户输入问题，与直接粘贴非视频链接同样映射为 400，而非 500
        if (error instanceof RangeError) {
          throw new DomainValidationError('url', '短链未解析为视频');
        }
        throw error;
      }
    }
    if (normalized.bvid === null) {
      throw new DomainValidationError('url', '短链未解析为视频');
    }
    const metadata = await this.bili.getVideo(normalized.bvid);
    // getVideo 让出事件循环期间系列可能被并发删除，开头的校验此时已过期。
    // 从这里到函数结束全是同步 SQLite 写、无让出点：此刻复查即可保证
    // upsert → append → resolve 整个序列观察不到系列消失，杜绝部分提交后报 404。
    if (input.seriesId !== null) this.ensureSeriesExists(input.seriesId);
    const resource = this.resources.upsertMetadata(metadata, this.now(), this.createId);
    if (input.seriesId !== null) {
      if (this.series.appendResource(input.seriesId, resource.id, this.now()) === undefined) {
        throw new ResourceNotFoundError('LEARNING_SERIES_NOT_FOUND', '学习系列不存在');
      }
    }
    this.resources.resolveUnresolved(requestedUrl, resource.id, this.now());
    return {
      kind: 'resource',
      resource,
      season: metadata.season === null ? null : toSeasonPreview(metadata.season),
    };
  }

  /**
   * 一键导入整个 B站合集：合集存为一个学习资源，每集存为一个分P，
   * 一次 view 请求已带回全部分集元数据。按 bili_season_id 幂等，
   * 重复导入刷新元数据；已单独导入的分集会被吸收（进度并入对应分集后移除）。
   */
  public async importSeason(bvid: string): Promise<BiliSeasonImportResult> {
    const metadata = await this.bili.getVideo(bvid);
    const season = metadata.season;
    if (season === null) {
      throw new DomainValidationError('bvid', '该视频不属于任何合集');
    }
    if (season.episodes.length > MAX_SEASON_EPISODES) {
      throw new DomainValidationError('bvid', '合集分集数量超出上限');
    }
    const now = this.now();
    const seasonMetadata: BiliVideoMetadata = {
      bvid: metadata.bvid,
      sourceUrl: metadata.sourceUrl,
      title: season.title,
      coverUrl: metadata.coverUrl ?? season.episodes[0]?.coverUrl ?? null,
      uploaderName: metadata.uploaderName,
      durationSeconds: season.episodes.reduce(
        (total, episode) => total + episode.durationSeconds,
        0,
      ),
      parts: season.episodes.map((episode, index) => ({
        cid: episode.parts[0]!.cid,
        partNumber: index + 1,
        title: episode.title,
        durationSeconds: episode.durationSeconds,
        episodeBvid: episode.bvid,
      })),
      season: null,
    };
    if (this.resources.findByBiliSeasonId(season.seasonId) !== undefined) {
      const resource = this.resources.upsertMetadata(
        seasonMetadata,
        now,
        this.createId,
        season.seasonId,
      );
      return { season: toSeasonPreview(season), resource };
    }
    // 先吸收后建卡：独立资源占着分集 BV（含入口视频），不先移除会撞 external_id 唯一索引。
    // 各操作各自一个事务（withTransaction 不支持嵌套），顺序保证合集卡片先于进度迁移存在。
    const absorbed: Array<{ bvid: string; seconds: number; observedAt: string }> = [];
    for (const episode of season.episodes) {
      const standalone = this.resources.findStandaloneByExternalId(episode.bvid);
      if (standalone === undefined) continue;
      absorbed.push({
        bvid: episode.bvid,
        seconds: overallWatchedSeconds(standalone),
        observedAt: standalone.progress.lastObservedAt ?? epochMillisecondsToIso(now),
      });
      if (!this.resources.softDelete(standalone.id, standalone.revision, now)) {
        throw new RevisionConflictError(standalone);
      }
    }
    const resource = this.resources.upsertMetadata(
      seasonMetadata,
      now,
      this.createId,
      season.seasonId,
    );
    for (const entry of absorbed) {
      if (entry.seconds <= 0) continue;
      const part = resource.parts.find((item) => item.episodeBvid === entry.bvid);
      const current = this.resources.find(resource.id);
      if (part === undefined || current === undefined) continue;
      this.observe(resource.id, {
        revision: current.progress.revision,
        partId: part.id,
        seconds: Math.min(entry.seconds, part.durationSeconds),
        observedAt: entry.observedAt,
        source: 'import',
      });
    }
    return {
      season: toSeasonPreview(season),
      resource: this.resources.find(resource.id) ?? resource,
    };
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
      {
        progress: merged.progress,
        partProgress: merged.partProgress,
        watchedDelta: merged.watchedDelta,
        observedAt: input.observedAt,
      },
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

  public rename(id: string, input: RenameLearningResourceInput): LearningResource {
    const current = this.required(id);
    if (current.revision !== input.revision) throw new RevisionConflictError(current);
    const updated = this.resources.rename(id, input.revision, input.customTitle, this.now());
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

  private ensureSeriesExists(id: string): void {
    if (this.series.find(id) === undefined) {
      throw new ResourceNotFoundError('LEARNING_SERIES_NOT_FOUND', '学习系列不存在');
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
