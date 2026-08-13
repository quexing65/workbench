import { healthResponseSchema, type HealthResponse } from '@workbench/shared';

import { apiRequest } from './client';

export async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  return apiRequest('/api/v1/health', healthResponseSchema, { signal });
}
