import {
  biliCredentialStatusSchema,
  learningSyncRunSchema,
  learningSyncStartResponseSchema,
  type BiliBrowser,
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

export function fetchBiliCredential(
  browser: BiliBrowser,
  restart: { readonly forceRestart: boolean; readonly confirmation?: 'restart-browser' },
) {
  return apiRequest('/api/v1/bili/credential/fetch', biliCredentialStatusSchema, {
    method: 'POST',
    body: { browser, ...restart },
  });
}

export function startLearningSync(pages: number) {
  return apiRequest('/api/v1/learning/sync', learningSyncStartResponseSchema, {
    method: 'POST',
    body: { pages },
  });
}

export function getLearningSyncRun(runId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/learning/sync/${runId}`, learningSyncRunSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}
