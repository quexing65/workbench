import { z } from 'zod';

import { businessDateSpan, compareBusinessDates, isBusinessDate } from '../domain/business-date.js';
import { dayStatsSchema } from './overview.js';

const businessDateSchema = z.string().refine(isBusinessDate, '必须是有效的 YYYY-MM-DD 日期');

export const reviewQuerySchema = z
  .object({ from: businessDateSchema, to: businessDateSchema })
  .strict()
  .superRefine(({ from, to }, context) => {
    if (!isBusinessDate(from) || !isBusinessDate(to)) return;
    if (compareBusinessDates(from, to) > 0) {
      context.addIssue({ code: 'custom', message: '开始日期不能晚于结束日期', path: ['from'] });
    } else if (businessDateSpan(from, to) > 366) {
      context.addIssue({ code: 'custom', message: '复盘范围不能超过 366 天', path: ['to'] });
    }
  });

export const reviewResponseSchema = z.object({
  from: businessDateSchema,
  to: businessDateSchema,
  days: z.array(dayStatsSchema).min(1).max(366),
  totals: z.object({
    planned: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1).nullable(),
    learningActivities: z.number().int().nonnegative(),
  }),
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
