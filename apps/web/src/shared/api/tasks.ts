import {
  dailyTaskSchema,
  overdueTaskListResponseSchema,
  taskListResponseSchema,
  type CreateTaskInput,
  type DailyTask,
  type OverdueStatusFilter,
  type OverdueTaskListResponse,
  type TaskListResponse,
  type TaskStatus,
  type UpdateOccurrenceInput,
} from '@workbench/shared';
import { z } from 'zod';

import { apiRequest } from './client';

export function getTasks(date: string, signal?: AbortSignal): Promise<TaskListResponse> {
  return apiRequest(`/api/v1/tasks?date=${encodeURIComponent(date)}`, taskListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getOverdueTasks(
  date: string,
  status: OverdueStatusFilter = 'active',
  signal?: AbortSignal,
): Promise<OverdueTaskListResponse> {
  return apiRequest(
    `/api/v1/tasks/overdue?date=${encodeURIComponent(date)}&status=${status}`,
    overdueTaskListResponseSchema,
    { ...(signal === undefined ? {} : { signal }) },
  );
}

export function createTask(input: CreateTaskInput): Promise<DailyTask> {
  return apiRequest('/api/v1/tasks', dailyTaskSchema, { method: 'POST', body: input });
}

export function updateTask(
  id: string,
  revision: number,
  patch: { title?: string; description?: string; date?: string; status?: TaskStatus },
): Promise<DailyTask> {
  return apiRequest(`/api/v1/tasks/${id}`, dailyTaskSchema, {
    method: 'PATCH',
    body: { revision, ...patch },
  });
}

export function deleteTask(id: string, revision: number): Promise<void> {
  return apiRequest(`/api/v1/tasks/${id}`, z.void(), { method: 'DELETE', revision });
}

const occurrenceResponseSchema = z.object({
  templateId: z.string().uuid(),
  date: z.string(),
  status: z.enum(['active', 'completed', 'cancelled']),
  revision: z.number().int().positive(),
});

export function updateOccurrence(
  templateId: string,
  date: string,
  revision: number,
  status: UpdateOccurrenceInput['status'],
) {
  return apiRequest(
    `/api/v1/recurring-tasks/${templateId}/occurrences/${date}`,
    occurrenceResponseSchema,
    { method: 'PUT', body: { revision, status } },
  );
}
