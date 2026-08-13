import { healthResponseSchema, type HealthResponse } from '@workbench/shared';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new ApiError('工作台服务暂时不可用', response.status);
  }

  return healthResponseSchema.parse(await response.json());
}
