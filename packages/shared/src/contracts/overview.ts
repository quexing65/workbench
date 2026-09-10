import { z } from 'zod';

import {
  addBusinessDays,
  compareBusinessDates,
  isBusinessDate,
  MIN_BUSINESS_DATE,
} from '../domain/business-date.js';
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

// 总览固定回看 7 天（date-6 起），date 前移 6 天后必须仍是可表示的业务日。
const overviewMinDate = addBusinessDays(MIN_BUSINESS_DATE, 6);

export const overviewQuerySchema = z
  .object({ date: businessDateSchema })
  .strict()
  .superRefine(({ date }, context) => {
    if (!isBusinessDate(date)) return;
    if (compareBusinessDates(date, overviewMinDate) < 0) {
      context.addIssue({
        code: 'custom',
        message: '日期过早，无法构成 7 天总览区间',
        path: ['date'],
      });
    }
  });
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
