import { z } from 'zod';

const utcTimestampSchema = z.string().datetime({ offset: false });
const nullableUtcTimestampSchema = utcTimestampSchema.nullable();

export const learningProgressSchema = z.object({
  furthestPartId: z.string().uuid().nullable(),
  furthestSeconds: z.number().int().nonnegative(),
  resumePartId: z.string().uuid().nullable(),
  resumeSeconds: z.number().int().nonnegative(),
  completed: z.boolean(),
  completedAt: nullableUtcTimestampSchema,
  lastObservedAt: nullableUtcTimestampSchema,
  manualOverrideAt: nullableUtcTimestampSchema,
  revision: z.number().int().positive(),
});
export type LearningProgress = z.infer<typeof learningProgressSchema>;

export const learningPartProgressSchema = z.object({
  furthestSeconds: z.number().int().nonnegative(),
  watchedSeconds: z.number().int().nonnegative(),
  lastSeconds: z.number().int().nonnegative(),
  completed: z.boolean(),
  completedAt: nullableUtcTimestampSchema,
  lastObservedAt: nullableUtcTimestampSchema,
  revision: z.number().int().positive(),
});
export type LearningPartProgress = z.infer<typeof learningPartProgressSchema>;

export const learningPartSchema = z.object({
  id: z.string().uuid(),
  externalPartId: z.string().min(1).max(200),
  partNumber: z.number().int().positive(),
  title: z.string().min(1).max(500),
  durationSeconds: z.number().int().nonnegative(),
  progress: learningPartProgressSchema.nullable(),
  revision: z.number().int().positive(),
});
export type LearningPart = z.infer<typeof learningPartSchema>;

export const learningResourceSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string().regex(/^BV[0-9A-Za-z]{10}$/u),
  sourceUrl: z.string().url(),
  title: z.string().min(1).max(500),
  coverUrl: z.string().url().nullable(),
  uploaderName: z.string().max(500).nullable(),
  durationSeconds: z.number().int().nonnegative(),
  parts: z.array(learningPartSchema),
  progress: learningProgressSchema,
  revision: z.number().int().positive(),
});
export type LearningResource = z.infer<typeof learningResourceSchema>;

export const learningResourceListResponseSchema = z.object({
  items: z.array(learningResourceSchema),
});

export const unresolvedLearningLinkSchema = z.object({
  id: z.string().uuid(),
  normalizedUrl: z.string().url(),
  requestedPartNumber: z.number().int().positive(),
  revision: z.number().int().positive(),
});
export type UnresolvedLearningLink = z.infer<typeof unresolvedLearningLinkSchema>;

export const importLearningResourceSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    seriesId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type ImportLearningResourceInput = z.infer<typeof importLearningResourceSchema>;

export const learningImportResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resource'), resource: learningResourceSchema }),
  z.object({ kind: z.literal('unresolved'), unresolved: unresolvedLearningLinkSchema }),
]);
export type LearningImportResult = z.infer<typeof learningImportResultSchema>;

export const observeLearningProgressSchema = z
  .object({
    revision: z.number().int().positive(),
    partId: z.string().uuid(),
    seconds: z.number().int().nonnegative(),
    observedAt: utcTimestampSchema,
    source: z.enum(['manual', 'sync', 'import']),
  })
  .strict();
export type ObserveLearningProgressInput = z.infer<typeof observeLearningProgressSchema>;

export const completeLearningProgressSchema = z
  .object({
    revision: z.number().int().positive(),
    confirmation: z.literal('complete-learning'),
  })
  .strict();
export const resetLearningProgressSchema = z
  .object({
    revision: z.number().int().positive(),
    confirmation: z.literal('reset-learning'),
  })
  .strict();

export const learningSeriesSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  resourceIds: z.array(z.string().uuid()),
  revision: z.number().int().positive(),
});
export type LearningSeries = z.infer<typeof learningSeriesSchema>;

export const learningSeriesListResponseSchema = z.object({ items: z.array(learningSeriesSchema) });
const seriesNameSchema = z.string().trim().min(1, '系列名称不能为空').max(200);
export const createLearningSeriesSchema = z.object({ name: seriesNameSchema }).strict();
export const updateLearningSeriesSchema = z
  .object({ revision: z.number().int().positive(), name: seriesNameSchema })
  .strict();
export const replaceLearningSeriesItemsSchema = z
  .object({
    revision: z.number().int().positive(),
    resourceIds: z.array(z.string().uuid()).max(500),
  })
  .strict()
  .refine(({ resourceIds }) => new Set(resourceIds).size === resourceIds.length, {
    path: ['resourceIds'],
    message: '系列资源不能重复',
  });

export type CreateLearningSeriesInput = z.infer<typeof createLearningSeriesSchema>;
export type UpdateLearningSeriesInput = z.infer<typeof updateLearningSeriesSchema>;
export type ReplaceLearningSeriesItemsInput = z.infer<typeof replaceLearningSeriesItemsSchema>;
