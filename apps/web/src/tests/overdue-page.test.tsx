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
    status: 'completed',
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
  {
    kind: 'daily',
    id: '10000000-0000-4000-8000-000000000004',
    title: '回复旧邮件',
    description: '',
    date: '2026-08-12',
    status: 'expired',
    revision: 2,
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

function stubFetch(list: unknown[] = items) {
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
      return json({ items: list });
    }),
  );
  return calls;
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
  it('requests every status and shows completion statistics with active items by default', async () => {
    const calls = stubFetch();
    renderPage();

    expect(await screen.findByText('共 4 项 · 未完成 2 · 已完成 1 · 已过期 1')).toBeInTheDocument();
    expect(String(calls[0]![0])).toContain('/api/v1/tasks/overdue?date=2026-08-13&status=all');

    // 默认只显示未完成：还书（已完成）与回复旧邮件（已过期）不可见
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('预约体检')).toBeInTheDocument();
    expect(screen.queryByText('还书')).not.toBeInTheDocument();
    expect(screen.queryByText('回复旧邮件')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '2026-08-11 1 项 · 逾期 2 天' }),
    ).toBeInTheDocument();
  });

  it('switches between status filters', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('写周报');

    fireEvent.click(screen.getByRole('button', { name: '已完成' }));
    expect(screen.getByText('还书')).toBeInTheDocument();
    expect(screen.queryByText('写周报')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '已过期' }));
    expect(screen.getByText('回复旧邮件')).toBeInTheDocument();
    expect(screen.queryByText('写周报')).not.toBeInTheDocument();
    expect(screen.queryByText('还书')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(screen.getByText('还书')).toBeInTheDocument();
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('预约体检')).toBeInTheDocument();
    expect(screen.getByText('回复旧邮件')).toBeInTheDocument();
  });

  it('marks a completed task as unfinished again', async () => {
    const calls = stubFetch();
    renderPage();
    await screen.findByText('写周报');

    fireEvent.click(screen.getByRole('button', { name: '已完成' }));
    fireEvent.click(await screen.findByRole('button', { name: '标为未完成' }));

    await waitFor(() => {
      const patch = calls.find(([, init]) => init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(String(patch![0])).toContain('/api/v1/tasks/10000000-0000-4000-8000-000000000002');
      expect(JSON.parse(String(patch![1]!.body))).toMatchObject({
        revision: 3,
        status: 'active',
      });
    });
  });

  it('deletes an expired task after confirmation', async () => {
    const calls = stubFetch();
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    renderPage();
    await screen.findByText('写周报');

    fireEvent.click(screen.getByRole('button', { name: '已过期' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));

    expect(confirm).toHaveBeenCalledWith('确定删除这条已过期的任务吗？');
    await waitFor(() => {
      const del = calls.find(([, init]) => init?.method === 'DELETE');
      expect(del).toBeDefined();
      expect(String(del![0])).toContain('/api/v1/tasks/10000000-0000-4000-8000-000000000004');
      expect(del![1]!.headers).toMatchObject({ 'If-Match': '"2"' });
    });
  });

  it('clears active tasks through move and complete actions', async () => {
    const calls = stubFetch();
    renderPage();
    await screen.findByText('写周报');

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

    fireEvent.click(screen.getAllByRole('button', { name: '完成' })[0]!);
    await waitFor(() => {
      const patches = calls.filter(([, init]) => init?.method === 'PATCH');
      expect(patches).toHaveLength(2);
      expect(JSON.parse(String(patches[1]![1]!.body))).toMatchObject({ status: 'completed' });
    });
  });

  it('shows the filtered-empty state when nothing matches the current view', async () => {
    stubFetch([items[1]!]);
    renderPage();

    expect(await screen.findByText('共 1 项 · 未完成 0 · 已完成 1 · 已过期 0')).toBeInTheDocument();
    expect(screen.getByText('当前筛选下没有任务。')).toBeInTheDocument();
  });

  it('shows the all-clear empty state', async () => {
    stubFetch([]);
    renderPage();
    expect(await screen.findByText('没有过期待办，保持得很好。')).toBeInTheDocument();
  });
});
