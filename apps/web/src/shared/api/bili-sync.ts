import {
  biliCredentialStatusSchema,
  learningSyncRunSchema,
  learningSyncStartResponseSchema,
} from '@workbench/shared';
import { z } from 'zod';

import { apiRequest } from './client';

export function getBiliCredentialStatus(signal?: AbortSignal) {
  return apiRequest('/api/v1/bili/credential/status', biliCredentialStatusSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function saveBiliCredential(sessdata: string) {
  return apiRequest('/api/v1/bili/credential', biliCredentialStatusSchema, {
    method: 'PUT',
    body: { sessdata },
  });
}

export function clearBiliCredential() {
  return apiRequest('/api/v1/bili/credential', z.void(), { method: 'DELETE' });
}

export function startLearningSync(resourceId: string, pages = 3) {
  return apiRequest('/api/v1/learning/sync', learningSyncStartResponseSchema, {
    method: 'POST',
    body: { resourceId, pages },
  });
}

export function getLearningSyncRun(runId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/learning/sync/${runId}`, learningSyncRunSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}
