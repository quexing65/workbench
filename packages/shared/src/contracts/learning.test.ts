import { describe, expect, it } from 'vitest';

import {
  completeLearningProgressSchema,
  importLearningResourceSchema,
  learningImportResultSchema,
  learningResourceSchema,
  replaceLearningSeriesItemsSchema,
  resetLearningProgressSchema,
} from './learning.js';

const resource = {
  id: '11111111-1111-4111-8111-111111111111',
  externalId: 'BV1AB411C7DE',
  sourceUrl: 'https://www.bilibili.com/video/BV1AB411C7DE/',
  title: '测试课程',
  coverUrl: null,
  uploaderName: null,
  durationSeconds: 60,
  parts: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      externalPartId: '101',
      partNumber: 1,
      title: '第一节',
      durationSeconds: 60,
      progress: null,
      revision: 1,
    },
  ],
  progress: {
    furthestPartId: null,
    furthestSeconds: 0,
    resumePartId: null,
    resumeSeconds: 0,
    completed: false,
    completedAt: null,
    lastObservedAt: null,
    manualOverrideAt: null,
    revision: 1,
  },
  revision: 1,
};

describe('learning contracts', () => {
  it('validates a resource and both import result variants', () => {
    expect(learningResourceSchema.parse(resource)).toEqual(resource);
    expect(learningImportResultSchema.parse({ kind: 'resource', resource })).toMatchObject({
      kind: 'resource',
    });
    expect(
      learningImportResultSchema.parse({
        kind: 'unresolved',
        unresolved: {
          id: '33333333-3333-4333-8333-333333333333',
          normalizedUrl: 'https://b23.tv/abc',
          requestedPartNumber: 2,
          revision: 1,
        },
      }),
    ).toMatchObject({ kind: 'unresolved' });
  });

  it('defaults optional series and rejects unknown import fields', () => {
    expect(importLearningResourceSchema.parse({ url: 'BV1AB411C7DE' })).toEqual({
      url: 'BV1AB411C7DE',
      seriesId: null,
    });
    expect(importLearningResourceSchema.safeParse({ url: 'x', credential: 'secret' }).success).toBe(
      false,
    );
  });

  it('requires exact destructive confirmations and unique series resources', () => {
    expect(
      completeLearningProgressSchema.safeParse({
        revision: 1,
        confirmation: 'complete-learning',
      }).success,
    ).toBe(true);
    expect(
      resetLearningProgressSchema.safeParse({ revision: 1, confirmation: 'reset-learning' })
        .success,
    ).toBe(true);
    expect(
      resetLearningProgressSchema.safeParse({ revision: 1, confirmation: 'yes' }).success,
    ).toBe(false);
    expect(
      replaceLearningSeriesItemsSchema.safeParse({
        revision: 1,
        resourceIds: [resource.id, resource.id],
      }).success,
    ).toBe(false);
  });
});
