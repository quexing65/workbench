import { z } from 'zod';

import { isBusinessDate } from '../domain/business-date.js';
import { noteSchema } from './notes.js';
import { dailyTaskSchema, taskListItemSchema } from './tasks.js';

const businessDateSchema = z.string().refine(isBusinessDate, '必须是有效的 YYYY-MM-DD 日期');

export const dayStatsSchema = z.object({
  date: businessDateSchema,
  planned: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1).nullable(),
  learningActivities: z.number().int().nonnegative(),
});
export type DayStats = z.infer<typeof dayStatsSchema>;

export const resumableLearningSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  sourceUrl: z.string().url(),
  coverUrl: z.string().url().nullable(),
  resumePartId: z.string().uuid(),
  resumePartTitle: z.string(),
  resumeSeconds: z.number().int().nonnegative(),
});
export type ResumableLearning = z.infer<typeof resumableLearningSchema>;

export const overviewQuerySchema = z.object({ date: businessDateSchema }).strict();
export const overviewResponseSchema = z.object({
  date: businessDateSchema,
  today: z.object({
    items: z.array(taskListItemSchema),
    planned: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }),
  overdueTasks: z.array(dailyTaskSchema),
  recentNotes: z.array(noteSchema),
  nextLearning: resumableLearningSchema.nullable(),
  last7Days: z.array(dayStatsSchema).length(7),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
