import { healthResponseSchema, type HealthResponse } from '@workbench/shared';

import { setConfiguredTimeZone } from './business-time';
import { apiRequest } from './client';

export async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  const health = await apiRequest('/api/v1/health', healthResponseSchema, { signal });
  // 业务日归属以服务端配置为准，前端「今天」随之后续渲染保持一致。
  setConfiguredTimeZone(health.timeZone);
  return health;
}
