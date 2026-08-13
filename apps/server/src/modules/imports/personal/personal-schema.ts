import { isBusinessDate, isoToEpochMilliseconds } from '@workbench/shared';
import { z } from 'zod';

const MAX_ITEMS = 5_000;
const MAX_DAYS = 50_000;
const boundedId = z.string().trim().min(1).max(200);
const timestamp = z.string().refine((value) => {
  try {
    isoToEpochMilliseconds(value);
    return true;
  } catch {
    return false;
  }
}, '时间戳无效');
const date = z.string().refine(isBusinessDate, '日期无效');
const status = z.enum(['active', 'completed', 'cancelled']);

const statusTimes = z
  .object({
    status,
    completedAt: timestamp.optional(),
    cancelledAt: timestamp.optional(),
  })
  .superRefine((value, context) => {
    const valid =
      (value.status === 'active' &&
        value.completedAt === undefined &&
        value.cancelledAt === undefined) ||
      (value.status === 'completed' &&
        value.completedAt !== undefined &&
        value.cancelledAt === undefined) ||
      (value.status === 'cancelled' &&
        value.completedAt === undefined &&
        value.cancelledAt !== undefined);
    if (!valid) context.addIssue({ code: 'custom', message: '状态与完成/取消时间冲突' });
  });

const taskSchema = z
  .object({
    id: boundedId,
    title: z.string().trim().min(1).max(500),
    date,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .and(statusTimes);

const fixedTaskSchema = z
  .object({
    id: boundedId,
    title: z.string().trim().min(1).max(500),
    startDate: date,
    endDate: date.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .refine(
    (value) => value.endDate === undefined || value.endDate >= value.startDate,
    '日期范围无效',
  );

const fixedTaskDaySchema = z
  .object({ fixedTaskId: boundedId, date, updatedAt: timestamp })
  .and(statusTimes);

const noteSchema = z.object({
  id: boundedId,
  content: z.string().trim().min(1).max(20_000),
  pinned: z.boolean().optional().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const studySchema = z.object({
  id: boundedId,
  title: z.string().trim().min(1).max(500),
  sourceUrl: z.string().trim().min(1).max(2_048),
  canonicalKey: z.string().trim().min(1).max(2_048).optional(),
  status: z.enum(['not_started', 'learning', 'completed']),
  lastPositionSec: z.number().finite().nonnegative().transform(Math.floor),
  lastOpenedAt: timestamp.optional(),
  completedAt: timestamp.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const tombstoneSchema = z.object({
  entity: z.enum(['task', 'fixed_task', 'note', 'study']),
  id: boundedId,
  deletedAt: timestamp,
  canonicalKey: z.string().trim().min(1).max(2_048).optional(),
});

const common = {
  revision: z.number().int().nonnegative().optional(),
  updatedAt: timestamp,
  tasks: z.array(taskSchema).max(MAX_ITEMS),
  notes: z.array(noteSchema).max(MAX_ITEMS),
  studyItems: z.array(studySchema).max(MAX_ITEMS),
};

const personalV1Schema = z.object({ version: z.literal(1), ...common });
const personalV2Schema = z.object({
  version: z.literal(2),
  ...common,
  tombstones: z.array(tombstoneSchema).max(MAX_ITEMS),
});
const personalV3Schema = z.object({
  version: z.literal(3),
  ...common,
  fixedTasks: z.array(fixedTaskSchema).max(MAX_ITEMS),
  fixedTaskDays: z.array(fixedTaskDaySchema).max(MAX_DAYS),
  tombstones: z.array(tombstoneSchema).max(MAX_ITEMS),
});

export const personalDataSchema = z.discriminatedUnion('version', [
  personalV1Schema,
  personalV2Schema,
  personalV3Schema,
]);
export const personalWrapperSchema = z.object({
  app: z.literal('personal-workbench'),
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: timestamp,
  data: personalDataSchema,
});

export type PersonalData = z.infer<typeof personalDataSchema>;
