import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() =>
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    ),
  );
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
