import {
  importPreflightResponseSchema,
  importReportSchema,
  type ImportSourceType,
} from '@workbench/shared';

import { apiError, apiRequest } from './client';

export async function preflightImport(input: {
  readonly sourceType: ImportSourceType;
  readonly sourceTimezone?: string;
  readonly file: File;
}) {
  const body = new FormData();
  body.set('sourceType', input.sourceType);
  if (input.sourceTimezone !== undefined) body.set('sourceTimezone', input.sourceTimezone);
  body.set('file', input.file);
  const response = await fetch('/api/v1/data/imports/preflight', {
    method: 'POST',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'X-Workbench-Request': '1' },
    body,
  });
  if (!response.ok && response.status !== 422) throw await apiError(response);
  return importPreflightResponseSchema.parse(await response.json());
}

export function applyImport(runId: string, confirmationToken: string) {
  return apiRequest(`/api/v1/data/imports/${runId}/apply`, importReportSchema, {
    method: 'POST',
    body: { confirmationToken },
  });
}

export function getImportReport(runId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/data/imports/${runId}/report`, importReportSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}
