import { z } from 'zod';

import { isBusinessDate } from '../domain/business-date.js';

export const taskStatusSchema = z.enum(['active', 'completed', 'cancelled', 'expired']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const businessDateSchema = z.string().refine(isBusinessDate, '必须是有效的 YYYY-MM-DD 日期');

const titleSchema = z.string().trim().min(1, '标题不能为空').max(500, '标题不能超过 500 个字符');
const descriptionSchema = z.string().max(20_000, '描述不能超过 20000 个字符');

export const dailyTaskSchema = z.object({
  kind: z.literal('daily'),
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  date: businessDateSchema,
  status: taskStatusSchema,
  revision: z.number().int().positive(),
});

export const recurringTaskListItemSchema = z.object({
  kind: z.literal('recurring'),
  id: z.string(),
  templateId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  date: businessDateSchema,
  status: taskStatusSchema,
  revision: z.number().int().nonnegative(),
});

export const taskListItemSchema = z.discriminatedUnion('kind', [
  dailyTaskSchema,
  recurringTaskListItemSchema,
]);
export type TaskListItem = z.infer<typeof taskListItemSchema>;
export type DailyTask = z.infer<typeof dailyTaskSchema>;

export const taskListResponseSchema = z.object({ items: z.array(taskListItemSchema) });
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

export const overdueTaskListResponseSchema = z.object({ items: z.array(dailyTaskSchema) });
export type OverdueTaskListResponse = z.infer<typeof overdueTaskListResponseSchema>;

export const taskListQuerySchema = z.object({ date: businessDateSchema }).strict();

/**
 * Overdue list filter. 'all' means active + completed + expired so callers can
 * compute completion statistics; cancelled tasks stay hidden from the overdue
 * surface.
 */
export const overdueStatusFilterSchema = z.enum(['active', 'completed', 'expired', 'all']);
export type OverdueStatusFilter = z.infer<typeof overdueStatusFilterSchema>;

export const overdueTaskListQuerySchema = z
  .object({
    date: businessDateSchema,
    status: overdueStatusFilterSchema.default('active'),
  })
  .strict();

export const createTaskSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.default(''),
    date: businessDateSchema,
  })
  .strict();

export const updateTaskSchema = z
  .object({
    revision: z.number().int().positive(),
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    date: businessDateSchema.optional(),
    status: taskStatusSchema.optional(),
  })
  .strict()
  .refine(
    ({ title, description, date, status }) =>
      title !== undefined ||
      description !== undefined ||
      date !== undefined ||
      status !== undefined,
    { message: '至少提供一个要更新的字段' },
  );

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
