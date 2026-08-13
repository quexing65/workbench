import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../shared/api/client';
import { createNote, deleteNote, updateNote } from '../shared/api/notes';
import {
  createRecurringTask,
  deleteRecurringTask,
  getRecurringTasks,
  updateRecurringTask,
} from '../shared/api/recurring';
import { deleteTask, updateOccurrence, updateTask } from '../shared/api/tasks';

const parse = <T>(value: T) => ({ parse: () => value });

afterEach(() => vi.unstubAllGlobals());

describe('typed API client', () => {
  it('adds JSON write headers and parses successful responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      apiRequest('/api/v1/example', parse({ ok: true }), {
        method: 'PATCH',
        body: { value: 1 },
        revision: 3,
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/example',
      expect.objectContaining({
        body: '{"value":1}',
        headers: expect.objectContaining({
          'If-Match': '"3"',
          'X-Workbench-Request': '1',
        }),
      }),
    );
  });

  it('handles no-content and safe structured and unstructured failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })));
    await expect(
      apiRequest('/delete', parse(undefined), { method: 'DELETE' }),
    ).resolves.toBeUndefined();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'REVISION_CONFLICT',
            message: '冲突',
            details: [{ message: '刷新', current: { revision: 2 } }],
          },
        }),
        { status: 409 },
      ),
    );
    await expect(apiRequest('/conflict', parse(undefined))).rejects.toMatchObject({
      status: 409,
      code: 'REVISION_CONFLICT',
      current: { revision: 2 },
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('not json', { status: 500 }));
    await expect(apiRequest('/bad', parse(undefined))).rejects.toEqual(
      expect.objectContaining({
        status: 500,
        code: 'REQUEST_FAILED',
        message: '请求失败，请稍后重试',
      }),
    );
  });

  it('covers task, recurring and note endpoint helpers', async () => {
    const responses = [
      {
        kind: 'daily',
        id: '11111111-1111-4111-8111-111111111111',
        title: '任务',
        description: '',
        date: '2026-08-13',
        status: 'active',
        revision: 2,
      },
      {
        templateId: '22222222-2222-4222-8222-222222222222',
        date: '2026-08-13',
        status: 'completed',
        revision: 1,
      },
      { items: [] },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: '复盘',
        description: '',
        startDate: '2026-08-13',
        endDate: null,
        revision: 1,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: '复盘 2',
        description: '',
        startDate: '2026-08-13',
        endDate: null,
        revision: 2,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        content: '小记',
        pinned: false,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
        revision: 1,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        content: '小记',
        pinned: true,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
        revision: 2,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(responses.shift()), { status: 200 }),
      ),
    );
    await updateTask('11111111-1111-4111-8111-111111111111', 1, { status: 'active' });
    await updateOccurrence('22222222-2222-4222-8222-222222222222', '2026-08-13', 0, 'completed');
    await deleteTask('11111111-1111-4111-8111-111111111111', 2);
    await getRecurringTasks();
    await createRecurringTask({
      title: '复盘',
      description: '',
      startDate: '2026-08-13',
      endDate: null,
    });
    await updateRecurringTask('22222222-2222-4222-8222-222222222222', 1, { title: '复盘 2' });
    await deleteRecurringTask('22222222-2222-4222-8222-222222222222', 2);
    await createNote({ content: '小记', pinned: false });
    await updateNote('33333333-3333-4333-8333-333333333333', 1, { pinned: true });
    await deleteNote('33333333-3333-4333-8333-333333333333', 2);
    expect(fetch).toHaveBeenCalledTimes(10);
  });
});
