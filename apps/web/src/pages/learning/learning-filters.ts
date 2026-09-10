import type { LearningResource, LearningSeries } from '@workbench/shared';

export type SeriesFilter = 'all' | 'none' | (string & {});
export type StatusFilter = 'all' | 'learning' | 'completed';
export type SortKey = 'recent' | 'progress' | 'title';

export interface LearningViewOptions {
  readonly series: SeriesFilter;
  readonly status: StatusFilter;
  readonly sort: SortKey;
}

export const DEFAULT_LEARNING_VIEW: LearningViewOptions = {
  series: 'all',
  status: 'all',
  sort: 'recent',
};

/** 与学习卡片一致的整体完成度口径：已完成记 1，否则取 furthest 之前分P全长 + furthest 秒数。 */
export function watchedRatio(resource: LearningResource): number {
  if (resource.progress.completed) return 1;
  if (resource.durationSeconds <= 0) return 0;
  const furthestIndex = resource.parts.findIndex(
    (part) => part.id === resource.progress.furthestPartId,
  );
  const before =
    furthestIndex > 0
      ? resource.parts.slice(0, furthestIndex).reduce((sum, part) => sum + part.durationSeconds, 0)
      : 0;
  return Math.min(1, (before + resource.progress.furthestSeconds) / resource.durationSeconds);
}

export function buildSeriesMembership(
  series: readonly LearningSeries[],
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const entry of series) {
    for (const resourceId of entry.resourceIds) {
      const existing = map.get(resourceId);
      if (existing === undefined) map.set(resourceId, [entry.id]);
      else existing.push(entry.id);
    }
  }
  return map;
}

/** 纯筛选/排序：不改变入参数组，供学习页工具栏驱动。 */
export function filterLearningResources(
  items: readonly LearningResource[],
  membership: ReadonlyMap<string, readonly string[]>,
  options: LearningViewOptions,
): LearningResource[] {
  let result = [...items];
  if (options.status !== 'all') {
    result = result.filter((resource) =>
      options.status === 'completed' ? resource.progress.completed : !resource.progress.completed,
    );
  }
  if (options.series !== 'all') {
    result = result.filter((resource) => {
      const owners = membership.get(resource.id) ?? [];
      return options.series === 'none' ? owners.length === 0 : owners.includes(options.series);
    });
  }
  switch (options.sort) {
    case 'progress':
      result.sort((a, b) => watchedRatio(b) - watchedRatio(a));
      break;
    case 'title':
      result.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
      break;
    case 'recent':
      result.sort((a, b) =>
        (b.progress.lastObservedAt ?? '').localeCompare(a.progress.lastObservedAt ?? ''),
      );
      break;
  }
  return result;
}
