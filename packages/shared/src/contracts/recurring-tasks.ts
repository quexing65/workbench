import { z } from 'zod';

import { isBusinessDate } from '../domain/business-date.js';
import { taskStatusSchema } from './tasks.js';

const dateSchema = z.string().refine(isBusinessDate, '必须是有效的 YYYY-MM-DD 日期');
const titleSchema = z.string().trim().min(1, '标题不能为空').max(500, '标题不能超过 500 个字符');
const descriptionSchema = z.string().max(20_000, '描述不能超过 20000 个字符');

export const recurringTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  startDate: dateSchema,
  endDate: dateSchema.nullable(),
  revision: z.number().int().positive(),
});
export type RecurringTask = z.infer<typeof recurringTaskSchema>;

export const recurringTaskListResponseSchema = z.object({
  items: z.array(recurringTaskSchema),
});

export const createRecurringTaskSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.default(''),
    startDate: dateSchema,
    endDate: dateSchema.nullable().default(null),
  })
  .strict()
  .refine(({ startDate, endDate }) => endDate === null || endDate >= startDate, {
    path: ['endDate'],
    message: '结束日期不能早于开始日期',
  });

export const updateRecurringTaskSchema = z
  .object({
    revision: z.number().int().positive(),
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.nullable().optional(),
  })
  .strict()
  .refine(
    ({ title, description, startDate, endDate }) =>
      title !== undefined ||
      description !== undefined ||
      startDate !== undefined ||
      endDate !== undefined,
    { message: '至少提供一个要更新的字段' },
  );

export const occurrenceParamsSchema = z
  .object({ id: z.string().uuid(), date: dateSchema })
  .strict();
export const updateOccurrenceSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    status: taskStatusSchema,
  })
  .strict();

export type CreateRecurringTaskInput = z.infer<typeof createRecurringTaskSchema>;
export type UpdateRecurringTaskInput = z.infer<typeof updateRecurringTaskSchema>;
export type UpdateOccurrenceInput = z.infer<typeof updateOccurrenceSchema>;
