import {
  recurringTaskListResponseSchema,
  recurringTaskSchema,
  type CreateRecurringTaskInput,
  type RecurringTask,
} from '@workbench/shared';
import { z } from 'zod';

import { apiRequest } from './client';

export function getRecurringTasks(signal?: AbortSignal) {
  return apiRequest('/api/v1/recurring-tasks', recurringTaskListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createRecurringTask(input: CreateRecurringTaskInput): Promise<RecurringTask> {
  return apiRequest('/api/v1/recurring-tasks', recurringTaskSchema, {
    method: 'POST',
    body: input,
  });
}

export function updateRecurringTask(
  id: string,
  revision: number,
  patch: Partial<Omit<RecurringTask, 'id' | 'revision'>>,
): Promise<RecurringTask> {
  return apiRequest(`/api/v1/recurring-tasks/${id}`, recurringTaskSchema, {
    method: 'PATCH',
    body: { revision, ...patch },
  });
}

export function deleteRecurringTask(id: string, revision: number): Promise<void> {
  return apiRequest(`/api/v1/recurring-tasks/${id}`, z.void(), {
    method: 'DELETE',
    revision,
  });
}
