import { describe, expect, it } from 'vitest';

import { resource, series } from './learning-fixtures';
import {
  buildSeriesMembership,
  DEFAULT_LEARNING_VIEW,
  filterLearningResources,
  watchedRatio,
} from '../pages/learning/learning-filters';

const secondId = '55555555-5555-4555-8555-555555555555';

function completedResource() {
  return resource({
    id: secondId,
    externalId: 'BV1XY411C7DE',
    title: '完成课程',
    progress: { ...resource().progress, completed: true },
  });
}

describe('watchedRatio', () => {
  it('treats completed resources as fully watched', () => {
    expect(watchedRatio(completedResource())).toBe(1);
  });

  it('sums part durations before the furthest part', () => {
    const item = resource({
      progress: {
        ...resource().progress,
        furthestPartId: resource().parts[1]!.id,
        furthestSeconds: 60,
      },
    });
    // 第一分P全长 60 秒 + 第二分P 的 60 秒 = 120 / 总长 180
    expect(watchedRatio(item)).toBeCloseTo(120 / 180);
  });

  it('is zero for empty durations', () => {
    expect(watchedRatio(resource({ durationSeconds: 0 }))).toBe(0);
  });
});

describe('filterLearningResources', () => {
  const items = [resource(), completedResource()];
  const membership = buildSeriesMembership([series({ resourceIds: [items[0]!.id] })]);

  it('keeps everything with the default view', () => {
    expect(filterLearningResources(items, membership, DEFAULT_LEARNING_VIEW)).toHaveLength(2);
  });

  it('filters by completion status', () => {
    const learning = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      status: 'learning',
    });
    expect(learning.map((item) => item.id)).toEqual([items[0]!.id]);
    const completed = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      status: 'completed',
    });
    expect(completed.map((item) => item.id)).toEqual([secondId]);
  });

  it('filters by series membership including the uncategorized bucket', () => {
    const inSeries = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      series: series().id,
    });
    expect(inSeries.map((item) => item.id)).toEqual([items[0]!.id]);
    const uncategorized = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      series: 'none',
    });
    expect(uncategorized.map((item) => item.id)).toEqual([secondId]);
  });

  it('sorts by progress, title and recency without mutating the input', () => {
    const byProgress = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      sort: 'progress',
    });
    expect(byProgress[0]!.id).toBe(secondId);

    const byTitle = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      sort: 'title',
    });
    expect(byTitle.map((item) => item.title)).toEqual(['安全测试课程', '完成课程'].sort());

    const recent = filterLearningResources(items, membership, {
      ...DEFAULT_LEARNING_VIEW,
      sort: 'recent',
    });
    expect(recent).toHaveLength(2);
    expect(items).toHaveLength(2);
  });
});
