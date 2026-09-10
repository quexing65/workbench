import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotesPage } from '../pages/notes/NotesPage';
import { TasksPage } from '../pages/tasks/TasksPage';

function renderPage(page: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {page}
    </QueryClientProvider>,
  );
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('business pages', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates a task, sends the write marker, and reloads the list', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    let items: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          items = [
            {
              kind: 'daily',
              id: '11111111-1111-4111-8111-111111111111',
              ...body,
              status: 'active',
              revision: 1,
            },
          ];
          return json(items[0], 201);
        }
        return json({ items });
      }),
    );
    renderPage(<TasksPage />);
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '完成报告' } });
    fireEvent.click(screen.getByRole('button', { name: '添加任务' }));

    expect(await screen.findByRole('heading', { name: '完成报告', level: 2 })).toBeInTheDocument();
    const post = calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[1]?.headers).toMatchObject({ 'X-Workbench-Request': '1' });
    expect(screen.getByLabelText('标题')).toHaveValue('');
  });

  it('retains a note draft after a failed save and retries successfully', async () => {
    let writes = 0;
    let items: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes += 1;
          if (writes === 1)
            return json(
              { error: { code: 'INTERNAL_ERROR', message: '保存失败', details: [] } },
              500,
            );
          const body = JSON.parse(String(init.body));
          items = [
            {
              id: '22222222-2222-4222-8222-222222222222',
              ...body,
              createdAt: '2026-08-13T00:00:00.000Z',
              updatedAt: '2026-08-13T00:00:00.000Z',
              revision: 1,
            },
          ];
          return json(items[0], 201);
        }
        return json({ items, nextCursor: null });
      }),
    );
    renderPage(<NotesPage />);
    const input = screen.getByLabelText('内容');
    fireEvent.change(input, { target: { value: '不会丢失的草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存小记' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
    expect(input).toHaveValue('不会丢失的草稿');

    fireEvent.click(screen.getByRole('button', { name: '保存小记' }));
    await waitFor(() => expect(screen.getByText('不会丢失的草稿')).toBeInTheDocument());
    expect(input).toHaveValue('');
  });

  it('appends the next notes page when the list reports a cursor', async () => {
    const pageOne = ['第一条小记', '第二条小记', '第三条小记', '第四条小记', '第五条小记'].map(
      (content, index) => ({
        id: `aaaaaaaa-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        content,
        pinned: false,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
        revision: 1,
      }),
    );
    const pageTwo = [
      {
        id: 'bbbbbbbb-0000-4000-8000-000000000001',
        content: '第六条小记',
        pinned: false,
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
        revision: 1,
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // 游标含冒号，会被 encodeURIComponent 转义为 %3A
      return json(
        url.includes('cursor=1%3A1770000000000%3A')
          ? { items: pageTwo, nextCursor: null }
          : { items: pageOne, nextCursor: '1:1770000000000:aaaa' },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<NotesPage />);

    expect(await screen.findByText('第五条小记')).toBeInTheDocument();
    expect(screen.queryByText('第六条小记')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('第六条小记')).toBeInTheDocument();
    expect(screen.getByText('第一条小记')).toBeInTheDocument();

    // 末页游标为 null，不再显示加载入口
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
  });

  it('excludes cancelled and expired tasks from the in-progress count', async () => {
    const base = { description: '', date: '2026-08-13', revision: 1 };
    const items = [
      {
        ...base,
        kind: 'daily',
        id: 'c0c0c0c0-0000-4000-8000-000000000001',
        title: '进行中任务',
        status: 'active',
      },
      {
        ...base,
        kind: 'daily',
        id: 'c0c0c0c0-0000-4000-8000-000000000002',
        title: '已完成任务',
        status: 'completed',
      },
      {
        ...base,
        kind: 'daily',
        id: 'c0c0c0c0-0000-4000-8000-000000000003',
        title: '已取消任务',
        status: 'cancelled',
      },
      {
        ...base,
        kind: 'daily',
        id: 'c0c0c0c0-0000-4000-8000-000000000004',
        title: '已过期任务',
        status: 'expired',
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ items })),
    );
    renderPage(<TasksPage />);

    expect(await screen.findByText('进行中任务')).toBeInTheDocument();
    // 4 项中 1 完成、1 取消、1 过期：只有 active 计入「进行中」
    expect(screen.getByText('1 项进行中 · 1 项已完成')).toBeInTheDocument();
  });

  it('shows a conflict message and keeps an edited task draft', async () => {
    const item = {
      kind: 'daily',
      id: '33333333-3333-4333-8333-333333333333',
      title: '原任务',
      description: '',
      date: '2026-08-13',
      status: 'active',
      revision: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'PATCH'
          ? json(
              {
                error: {
                  code: 'REVISION_CONFLICT',
                  message: '数据已被其他操作修改',
                  details: [{ message: '刷新', current: { ...item, revision: 2 } }],
                },
              },
              409,
            )
          : json({ items: [item] }),
      ),
    );
    renderPage(<TasksPage />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const title = screen
      .getAllByLabelText('标题')
      .find((element) => (element as HTMLInputElement).value === '原任务');
    expect(title).toBeDefined();
    if (title === undefined) throw new Error('编辑标题输入框不存在');
    fireEvent.change(title, { target: { value: '本地草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('数据已在其他页面修改');
    expect(title).toHaveValue('本地草稿');
  });
});
