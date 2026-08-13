import {
  overviewResponseSchema,
  reviewResponseSchema,
  type OverviewResponse,
  type ReviewResponse,
} from '@workbench/shared';

import { apiRequest } from './client';

export function getOverview(date: string, signal?: AbortSignal): Promise<OverviewResponse> {
  return apiRequest(`/api/v1/overview?date=${encodeURIComponent(date)}`, overviewResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getReview(from: string, to: string, signal?: AbortSignal): Promise<ReviewResponse> {
  return apiRequest(
    `/api/v1/review?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    reviewResponseSchema,
    { ...(signal === undefined ? {} : { signal }) },
  );
}
