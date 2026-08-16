import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverduePage } from '../pages/overdue/OverduePage';

const items = [
  {
    kind: 'daily',
    id: '10000000-0000-4000-8000-000000000001',
    title: '写周报',
    description: '上周的总结',
    date: '2026-08-11',
    status: 'active',
    revision: 1,
  },
  {
    kind: 'daily',
    id: '10000000-0000-4000-8000-000000000002',
    title: '还书',
    description: '',
    date: '2026-08-11',
    status: 'active',
    revision: 3,
  },
  {
    kind: 'daily',
    id: '10000000-0000-4000-8000-000000000003',
    title: '预约体检',
    description: '',
    date: '2026-08-12',
    status: 'active',
    revision: 1,
  },
];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  return render(
    <BrowserRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OverduePage />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T04:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('overdue page', () => {
  it('groups overdue tasks by date and clears them through actions', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { date?: string; status?: string };
          return json({
            kind: 'daily',
            id: '10000000-0000-4000-8000-000000000009',
            title: '已处理',
            description: '',
            date: body.date ?? '2026-08-13',
            status: body.status ?? 'active',
            revision: 2,
          });
        }
        return json({ items });
      }),
    );
    renderPage();

    expect(await screen.findByText('共 3 项 · 最早 2026-08-11')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '2026-08-11 2 项 · 逾期 2 天' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '2026-08-12 1 项 · 逾期 1 天' }),
    ).toBeInTheDocument();
    expect(screen.getByText('写周报')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '移到今天' })[0]!);
    await waitFor(() => {
      const patch = calls.find(([, init]) => init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(String(patch![0])).toContain('/api/v1/tasks/10000000-0000-4000-8000-000000000001');
      expect(JSON.parse(String(patch![1]!.body))).toMatchObject({
        revision: 1,
        date: '2026-08-13',
      });
    });

    fireEvent.click(screen.getAllByRole('button', { name: '完成' })[1]!);
    await waitFor(() => {
      const patches = calls.filter(([, init]) => init?.method === 'PATCH');
      expect(patches).toHaveLength(2);
      expect(JSON.parse(String(patches[1]![1]!.body))).toMatchObject({
        revision: 3,
        status: 'completed',
      });
    });
  });

  it('shows the all-clear empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ items: [] })),
    );
    renderPage();
    expect(await screen.findByText('没有过期待办，保持得很好。')).toBeInTheDocument();
  });
});
