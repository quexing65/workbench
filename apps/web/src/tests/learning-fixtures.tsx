import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LearningResource, LearningSeries } from '@workbench/shared';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { LearningPage } from '../pages/learning/LearningPage';

export const resourceId = '11111111-1111-4111-8111-111111111111';
export const firstPartId = '22222222-2222-4222-8222-222222222222';
const secondPartId = '33333333-3333-4333-8333-333333333333';
export const seriesId = '44444444-4444-4444-8444-444444444444';

export function resource(overrides: Partial<LearningResource> = {}): LearningResource {
  return {
    id: resourceId,
    externalId: 'BV1AB411C7DE',
    sourceUrl: 'https://www.bilibili.com/video/BV1AB411C7DE/',
    title: '安全测试课程',
    coverUrl: null,
    uploaderName: '测试作者',
    durationSeconds: 180,
    parts: [
      {
        id: firstPartId,
        externalPartId: '101',
        partNumber: 1,
        title: '基础',
        durationSeconds: 60,
        progress: null,
        revision: 1,
      },
      {
        id: secondPartId,
        externalPartId: '102',
        partNumber: 2,
        title: '进阶',
        durationSeconds: 120,
        progress: null,
        revision: 1,
      },
    ],
    progress: {
      furthestPartId: null,
      furthestSeconds: 0,
      resumePartId: null,
      resumeSeconds: 0,
      completed: false,
      completedAt: null,
      lastObservedAt: null,
      manualOverrideAt: null,
      revision: 1,
    },
    revision: 1,
    ...overrides,
  };
}

export function series(overrides: Partial<LearningSeries> = {}): LearningSeries {
  return { id: seriesId, name: '前端系列', resourceIds: [resourceId], revision: 1, ...overrides };
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function renderLearningPage() {
  const fetcher = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      requestPath(input).endsWith('/bili/credential/status') &&
      (init?.method === undefined || init.method === 'GET')
    ) {
      return Promise.resolve(json({ present: false, valid: false, userLabel: '未连接' }));
    }
    return fetcher(input, init);
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LearningPage />
    </QueryClientProvider>,
  );
}

export function requestPath(input: RequestInfo | URL): string {
  return String(input);
}
