import {
  learningImportResultSchema,
  learningResourceListResponseSchema,
  learningResourceSchema,
  learningSeriesListResponseSchema,
  learningSeriesSchema,
  type ImportLearningResourceInput,
  type ObserveLearningProgressInput,
  type ReplaceLearningSeriesItemsInput,
  type UpdateLearningSeriesInput,
} from '@workbench/shared';
import { z } from 'zod';

import { apiRequest } from './client';

export function getLearningResources(signal?: AbortSignal) {
  return apiRequest('/api/v1/learning/resources', learningResourceListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function importLearningResource(input: ImportLearningResourceInput) {
  return apiRequest('/api/v1/learning/resources', learningImportResultSchema, {
    method: 'POST',
    body: input,
  });
}

export function observeLearningProgress(id: string, input: ObserveLearningProgressInput) {
  return apiRequest(`/api/v1/learning/resources/${id}/progress/observe`, learningResourceSchema, {
    method: 'POST',
    body: input,
  });
}

export function completeLearningProgress(id: string, revision: number) {
  return apiRequest(`/api/v1/learning/resources/${id}/progress/complete`, learningResourceSchema, {
    method: 'POST',
    body: { revision, confirmation: 'complete-learning' },
  });
}

export function resetLearningProgress(id: string, revision: number) {
  return apiRequest(`/api/v1/learning/resources/${id}/progress/reset`, learningResourceSchema, {
    method: 'POST',
    body: { revision, confirmation: 'reset-learning' },
  });
}

export function deleteLearningResource(id: string, revision: number) {
  return apiRequest(`/api/v1/learning/resources/${id}`, z.void(), {
    method: 'DELETE',
    revision,
  });
}

export function getLearningSeries(signal?: AbortSignal) {
  return apiRequest('/api/v1/learning/series', learningSeriesListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createLearningSeries(name: string) {
  return apiRequest('/api/v1/learning/series', learningSeriesSchema, {
    method: 'POST',
    body: { name },
  });
}

export function updateLearningSeries(id: string, input: UpdateLearningSeriesInput) {
  return apiRequest(`/api/v1/learning/series/${id}`, learningSeriesSchema, {
    method: 'PATCH',
    body: input,
  });
}

export function replaceLearningSeriesItems(id: string, input: ReplaceLearningSeriesItemsInput) {
  return apiRequest(`/api/v1/learning/series/${id}/items`, learningSeriesSchema, {
    method: 'PUT',
    body: input,
  });
}

export function deleteLearningSeries(id: string, revision: number) {
  return apiRequest(`/api/v1/learning/series/${id}`, z.void(), {
    method: 'DELETE',
    revision,
  });
}
