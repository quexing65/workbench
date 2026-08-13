import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBusinessDays } from '@workbench/shared';

import { OverviewPage } from '../pages/overview/OverviewPage';
import { ReviewPage } from '../pages/review/ReviewPage';

const date = '2026-08-13';
const day = {
  date,
  planned: 2,
  completed: 1,
  cancelled: 0,
  completionRate: 0.5,
  learningActivities: 1,
};
const overview = {
  date,
  today: {
    items: [
      {
        kind: 'daily',
        id: '10000000-0000-4000-8000-000000000001',
        title: '完成阶段回顾',
        description: '先做最重要的事情',
        date,
        status: 'active',
        revision: 1,
      },
    ],
    planned: 1,
    active: 1,
    completed: 0,
    cancelled: 0,
  },
  overdueTasks: [
    {
      kind: 'daily',
      id: '10000000-0000-4000-8000-000000000002',
      title: '整理旧任务',
      description: '',
      date: '2026-08-12',
      status: 'active',
      revision: 2,
    },
  ],
  recentNotes: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      content: '记录一个可靠的想法',
      pinned: false,
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
      revision: 1,
    },
  ],
  nextLearning: {
    id: '30000000-0000-4000-8000-000000000001',
    title: 'TypeScript 课程',
    sourceUrl: 'https://www.bilibili.com/video/BV1test',
    coverUrl: null,
    resumePartId: '40000000-0000-4000-8000-000000000001',
    resumePartTitle: '类型缩小',
    resumeSeconds: 180,
  },
  last7Days: Array.from({ length: 7 }, (_, index) => ({
    ...day,
    date: `2026-08-${String(index + 7).padStart(2, '0')}`,
  })),
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(page: React.ReactNode) {
  return render(
    <BrowserRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {page}
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

describe('overview page', () => {
  it('renders every real block, quick-adds and moves an overdue task', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        if (init?.method === 'POST') return json(overview.today.items[0], 201);
        if (init?.method === 'PATCH')
          return json({ ...overview.overdueTasks[0], date, revision: 3 });
        return json(overview);
      }),
    );
    renderPage(<OverviewPage />);

    expect(await screen.findByRole('heading', { name: '完成阶段回顾' })).toBeInTheDocument();
    expect(screen.getByText('记录一个可靠的想法')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TypeScript 课程' })).toBeInTheDocument();
    expect(screen.getAllByText('50%')).toHaveLength(7);

    fireEvent.change(screen.getByLabelText('快速添加今天的任务'), {
      target: { value: '新任务' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    await waitFor(() => expect(calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    expect(screen.getByLabelText('快速添加今天的任务')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: '移到今天' }));
    await waitFor(() => expect(calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
  });

  it('shows retry and truthful empty states', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500))
      .mockResolvedValue(
        json({
          ...overview,
          today: { ...overview.today, items: [], planned: 0, active: 0 },
          overdueTasks: [],
          recentNotes: [],
          nextLearning: null,
          last7Days: overview.last7Days.map((item) => ({
            ...item,
            planned: 0,
            completed: 0,
            completionRate: null,
          })),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<OverviewPage />);
    const retries = await screen.findAllByRole('button', { name: '重试' });
    fireEvent.click(retries[0]!);
    expect(await screen.findByText('没有逾期任务。')).toBeInTheDocument();
    expect(screen.getByText('还没有可续接的学习进度。')).toBeInTheDocument();
    expect(screen.getByText('近 7 天还没有计划，不计算完成率。')).toBeInTheDocument();
  });

  it('keeps a large overdue list available without rendering it all at once', async () => {
    const overdueTasks = Array.from({ length: 25 }, (_, index) => ({
      ...overview.overdueTasks[0],
      id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      title: `逾期任务 ${index + 1}`,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...overview, overdueTasks })));
    renderPage(<OverviewPage />);

    expect(await screen.findByText('逾期任务 20', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('逾期任务 21', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再显示 5 条（剩余 5 条）' }));
    expect(screen.getByText('逾期任务 25', { exact: true })).toBeInTheDocument();
  });
});

describe('review page', () => {
  it('shows totals, an equivalent data table and switches to thirty days', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const span = String(input).includes('2026-07-15') ? 30 : 7;
      const from = span === 30 ? '2026-07-15' : '2026-08-07';
      const days = Array.from({ length: span }, (_, index) => ({
        ...day,
        date: addBusinessDays(from, index),
      }));
      return json({
        from,
        to: date,
        days,
        totals: {
          planned: span * 2,
          completed: span,
          cancelled: 0,
          completionRate: 0.5,
          learningActivities: span,
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<ReviewPage />);
    expect(await screen.findByText('14')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName('每日计划、完成、取消和学习活动明细');
    fireEvent.click(screen.getByRole('button', { name: '近 30 天' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('2026-07-15'),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('60')).toBeInTheDocument();
  });

  it('does not show a misleading zero percent and can retry failures', async () => {
    const empty = {
      from: '2026-08-07',
      to: date,
      days: overview.last7Days.map((item) => ({
        ...item,
        planned: 0,
        completed: 0,
        completionRate: null,
        learningActivities: 0,
      })),
      totals: {
        planned: 0,
        completed: 0,
        cancelled: 0,
        completionRate: null,
        learningActivities: 0,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500))
        .mockResolvedValue(json(empty)),
    );
    renderPage(<ReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    expect(await screen.findByText('这段时间还没有计划，因此不计算完成率。')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
