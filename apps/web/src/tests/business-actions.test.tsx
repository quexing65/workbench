import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotesPage } from '../pages/notes/NotesPage';
import { RecurringPage } from '../pages/recurring/RecurringPage';
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

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

describe('business page actions', () => {
  it('creates, stops and deletes a recurring rule', async () => {
    let items: unknown[] = [];
    let revision = 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body === undefined ? {} : JSON.parse(String(init.body));
        if (init?.method === 'POST') {
          items = [{ id: '44444444-4444-4444-8444-444444444444', ...body, revision }];
          return json(items[0], 201);
        }
        if (init?.method === 'PATCH') {
          revision += 1;
          items = [{ ...(items[0] as object), ...body, revision }];
          return json(items[0]);
        }
        if (init?.method === 'DELETE') {
          items = [];
          return new Response(null, { status: 204 });
        }
        return json({ items });
      }),
    );
    renderPage(<RecurringPage />);
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '每日复盘' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    expect(await screen.findByDisplayValue('每日复盘')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '今天停止' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recurring-tasks/'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(screen.getByText('还没有固定任务。')).toBeInTheDocument());
  });

  it('edits, pins, searches and deletes a note, including keyboard save', async () => {
    let note = {
      id: '55555555-5555-4555-8555-555555555555',
      content: '原小记',
      pinned: false,
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
      revision: 1,
    };
    let deleted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          note = { ...note, ...JSON.parse(String(init.body)), revision: note.revision + 1 };
          return json(note);
        }
        if (init?.method === 'DELETE') {
          deleted = true;
          return new Response(null, { status: 204 });
        }
        return json({ items: deleted ? [] : [note], nextCursor: null });
      }),
    );
    renderPage(<NotesPage />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const edit = screen.getAllByLabelText('小记内容')[0];
    if (edit === undefined) throw new Error('小记编辑框不存在');
    fireEvent.change(edit, { target: { value: '修改后的小记' } });
    fireEvent.keyDown(edit, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getByText('修改后的小记')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '置顶' }));
    expect(await screen.findByRole('button', { name: '取消置顶' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '修改' } });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/v1/notes?q=%E4%BF%AE%E6%94%B9', expect.anything()),
    );
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(await screen.findByText('还没有匹配的小记。')).toBeInTheDocument();
  });

  it('updates a daily status and a recurring occurrence and deletes the daily task', async () => {
    const daily = {
      kind: 'daily',
      id: '66666666-6666-4666-8666-666666666666',
      title: '普通任务',
      description: '',
      date: '2026-08-13',
      status: 'active',
      revision: 1,
    };
    const recurring = {
      kind: 'recurring',
      id: '77777777-7777-4777-8777-777777777777:2026-08-13',
      templateId: '77777777-7777-4777-8777-777777777777',
      title: '固定任务',
      description: '',
      date: '2026-08-13',
      status: 'active',
      revision: 0,
    };
    let items: (typeof daily)[] | Array<typeof daily | typeof recurring> = [daily, recurring];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          items = items.map((item) =>
            item.kind === 'daily' ? { ...item, status: 'completed', revision: 2 } : item,
          );
          return json(items[0]);
        }
        if (init?.method === 'PUT')
          return json({
            templateId: recurring.templateId,
            date: recurring.date,
            status: 'cancelled',
            revision: 1,
          });
        if (init?.method === 'DELETE') {
          items = items.filter((item) => item.kind !== 'daily');
          return new Response(null, { status: 204 });
        }
        return json({ items });
      }),
    );
    renderPage(<TasksPage />);
    const completeButtons = await screen.findAllByRole('button', { name: '完成' });
    const firstComplete = completeButtons[0];
    if (firstComplete === undefined) throw new Error('任务完成按钮不存在');
    fireEvent.click(firstComplete);
    expect(await screen.findByText('已完成')).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole('button', { name: '取消' });
    fireEvent.click(cancelButtons.at(-1)!);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/occurrences/'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(screen.queryByText('普通任务')).not.toBeInTheDocument());
  });

  it('covers task edit cancellation, date changes, restore and retry states', async () => {
    const daily = {
      kind: 'daily',
      id: '88888888-8888-4888-8888-888888888888',
      title: '可恢复任务',
      description: '说明',
      date: '2026-08-13',
      status: 'cancelled',
      revision: 1,
    };
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body));
          Object.assign(daily, body, { revision: daily.revision + 1 });
          return json(daily);
        }
        reads += 1;
        if (reads === 1)
          return json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500);
        return json({ items: [daily] });
      }),
    );
    renderPage(<TasksPage />);
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const titles = screen.getAllByLabelText('标题');
    const editTitle = titles.find(
      (element) => (element as HTMLInputElement).value === '可恢复任务',
    );
    if (editTitle === undefined) throw new Error('编辑标题不存在');
    fireEvent.change(editTitle, { target: { value: '已修改草稿' } });
    fireEvent.change(screen.getAllByLabelText('描述').at(-1)!, { target: { value: '新说明' } });
    fireEvent.change(screen.getAllByLabelText('日期').at(-1)!, { target: { value: '2026-08-14' } });
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
    expect(screen.queryByDisplayValue('已修改草稿')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    fireEvent.change(screen.getByLabelText('切换日期'), { target: { value: '2026-08-14' } });
  });

  it('covers recurring editing controls and failed list retry', async () => {
    const item = {
      id: '99999999-9999-4999-8999-999999999999',
      title: '旧固定任务',
      description: '',
      startDate: '2026-08-13',
      endDate: null,
      revision: 1,
    };
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          Object.assign(item, JSON.parse(String(init.body)), { revision: item.revision + 1 });
          return json(item);
        }
        reads += 1;
        if (reads === 1)
          return json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500);
        return json({ items: [item] });
      }),
    );
    renderPage(<RecurringPage />);
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    const editTitle = await screen.findByDisplayValue('旧固定任务');
    fireEvent.change(editTitle, { target: { value: '新固定任务' } });
    fireEvent.change(screen.getAllByLabelText('开始').at(-1)!, { target: { value: '2026-08-14' } });
    fireEvent.change(screen.getAllByLabelText('结束').at(-1)!, { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recurring-tasks/'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });
});
