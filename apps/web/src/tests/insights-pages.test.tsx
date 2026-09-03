import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBusinessDays, businessDateSpan } from '@workbench/shared';

import { OverviewPage } from '../pages/overview/OverviewPage';
import { ReviewPage } from '../pages/review/ReviewPage';
import { ContributionHeatmap } from '../shared/ui/ContributionHeatmap';

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

function reviewPayload(from: string, to: string) {
  // 当前年窗口（2026-01-01 起）有完成记录，同比窗口全部为零。
  const isCurrent = from === '2026-01-01';
  const span = businessDateSpan(from, to);
  const days = Array.from({ length: span }, (_, index) => ({
    ...day,
    date: addBusinessDays(from, index),
    completed: isCurrent ? 1 : 0,
    completionRate: isCurrent ? 0.5 : 0,
    learningActivities: isCurrent ? 1 : 0,
  }));
  return {
    from,
    to,
    days,
    totals: {
      planned: span * 2,
      completed: isCurrent ? span : 0,
      cancelled: 0,
      completionRate: isCurrent ? 0.5 : 0,
      learningActivities: isCurrent ? span : 0,
    },
    // 观看进度是当前状态快照，与区间无关，两期返回相同值。
    learningDuration: {
      totalSeconds: 5400,
      bySeries: [
        {
          seriesId: '10000000-0000-4000-8000-000000000001',
          seriesName: '数据库',
          durationSeconds: 3600,
        },
        {
          seriesId: '10000000-0000-4000-8000-000000000002',
          seriesName: '人工智能',
          durationSeconds: 1800,
        },
      ],
    },
  };
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
        const url = String(input);
        if (url.includes('/api/v1/review')) return json(reviewPayload('2026-01-01', date));
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

    const progress = screen.getByRole('progressbar', { name: '今日完成进度' });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveAttribute('aria-valuetext', '已完成 0%');

    // 贡献轨迹：26 周滚动窗口是完整矩形，本周未到的日子渲染为空格子。
    // 窗口为 2026-02-15（周日）至 2026-08-15（周六），数据到 8 月 13 日。
    const heatmap = screen.getByRole('group', { name: '近半年每日任务完成贡献图' });
    expect(heatmap.querySelectorAll('.contribution-cell')).toHaveLength(26 * 7);
    expect(within(heatmap).getAllByRole('img')).toHaveLength(180);
    expect(screen.getByText('完成 180 项 · 有贡献 180 天 · 最长连续 180 天')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '过期待办 · 1' })).toBeInTheDocument();

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
    const emptyReview = {
      from: '2026-01-01',
      to: date,
      // schema 要求 days 至少一天；全零的一天代表真实空态。
      days: [
        {
          ...day,
          planned: 0,
          completed: 0,
          cancelled: 0,
          completionRate: null,
          learningActivities: 0,
        },
      ],
      totals: {
        planned: 0,
        completed: 0,
        cancelled: 0,
        completionRate: null,
        learningActivities: 0,
      },
      learningDuration: { totalSeconds: 0, bySeries: [] },
    };
    const emptyOverview = {
      ...overview,
      today: { ...overview.today, items: [], planned: 0, active: 0 },
      overdueTasks: [],
      recentNotes: [],
      nextLearning: null,
    };
    // 页面并发请求 overview 与 review；首次任意失败后重试，都应回到真实空态。
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500))
        .mockImplementation(async (input: RequestInfo | URL) =>
          json(String(input).includes('/api/v1/review') ? emptyReview : emptyOverview),
        ),
    );
    renderPage(<OverviewPage />);
    const retries = await screen.findAllByRole('button', { name: '重试' });
    for (const retry of retries) fireEvent.click(retry);
    expect(await screen.findByText('没有逾期任务。')).toBeInTheDocument();
    expect(screen.getByText('还没有可续接的学习进度。')).toBeInTheDocument();
    expect(screen.getByText('今天没有等待完成的任务，给自己留一点余白吧。')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '近半年每日任务完成贡献图' })).toBeInTheDocument();
    expect(screen.getByText('完成 0 项 · 有贡献 0 天 · 最长连续 0 天')).toBeInTheDocument();
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

describe('contribution heatmap', () => {
  it('covers the whole year, pads future days and labels month boundaries', () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      ...day,
      date: addBusinessDays('2026-08-30', index),
    }));

    render(
      <ContributionHeatmap
        days={days}
        from="2026-01-01"
        to="2026-12-31"
        label="2026 年每日任务完成贡献图"
      />,
    );

    const grid = screen.getByRole('group', { name: '2026 年每日任务完成贡献图' });
    expect(within(grid).getAllByRole('img')).toHaveLength(7);
    // 2026 年 1 月 1 日是周四：4 个前导占位 + 365 天 + 年尾占位 = 53 周 × 7 格。
    expect(grid.querySelectorAll('.contribution-cell')).toHaveLength(371);
    // 年内无数据的日期（测试数据只有 7 天）与"没有任务"的格子同样渲染：
    // 365 - 7 = 358 个 data-level=0 格子，边界对齐位保持透明。
    expect(grid.querySelectorAll('.contribution-cell[data-level="0"]')).toHaveLength(358);
    expect(grid.querySelectorAll('.contribution-cell.is-placeholder')).toHaveLength(6);
    expect(screen.getByText('1月')).toBeInTheDocument();
    expect(screen.getByText('9月')).toBeInTheDocument();
    expect(screen.getByText('12月')).toBeInTheDocument();
  });
});

describe('review page', () => {
  function reviewFetch() {
    return vi.fn(async (input: RequestInfo | URL) => {
      const params = new URL(String(input), 'http://localhost').searchParams;
      const from = params.get('from') ?? '2026-01-01';
      const to = params.get('to') ?? date;
      return json(reviewPayload(from, to));
    });
  }

  it('shows year-over-year stats and the annual contribution grid, then switches to the previous year', async () => {
    const fetchMock = reviewFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<ReviewPage />);

    expect(await screen.findByText('↑ 较上年同期 +50%')).toBeInTheDocument();
    expect(screen.getByText('↑ 较上年同期 +225 项')).toBeInTheDocument();
    expect(screen.getByText('↑ 较上年同期 +225 天')).toBeInTheDocument();
    expect(screen.getByText('当前状态，不随区间变化')).toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.getByText('共计划 450 项：完成 225 · 取消 0 · 待完成 225。')).toBeInTheDocument();

    const contribution = screen.getByRole('group', { name: '2026 年每日任务完成贡献图' });
    const cells = within(contribution).getAllByRole('img');
    // 今年只请求到今天（2026-08-13，年初以来 225 天），其余日期是未来占位格。
    expect(cells).toHaveLength(225);
    expect(contribution.querySelectorAll('.contribution-cell')).toHaveLength(371);
    expect(cells[0]).toHaveAttribute(
      'aria-label',
      '2026-01-01：完成 1，计划 2，取消 0，待完成 1，完成率 50%，学习活动 1 次',
    );
    expect(cells[0]).toHaveAttribute('data-level', '4');
    expect(screen.getByText('完成 225 项 · 有贡献 225 天 · 最长连续 225 天')).toBeInTheDocument();
    fireEvent.mouseEnter(cells[0]!);
    expect(await screen.findByText('完成 1 / 计划 2')).toBeInTheDocument();
    fireEvent.mouseLeave(cells[0]!);
    await waitFor(() => expect(screen.queryByText('完成 1 / 计划 2')).not.toBeInTheDocument());

    // 年份选择器紧邻贡献图，提供今年往回五年。
    const yearSelect = screen.getByLabelText('选择贡献图年份');
    expect(yearSelect).toHaveValue('2026');
    for (const label of ['2026 年', '2025 年', '2024 年', '2023 年', '2022 年']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }

    // 学习节奏改为年度概览，不再渲染逐日格子。
    expect(screen.getByText('学习活动')).toBeInTheDocument();
    expect(screen.getByText('225 次')).toBeInTheDocument();
    expect(screen.getByText('最活跃一天')).toBeInTheDocument();
    expect(screen.getByText('01-01（1 次）')).toBeInTheDocument();

    const durationPie = screen.getByRole('group', { name: /观看进度系列分布/ });
    expect(durationPie).toBeInTheDocument();
    expect(screen.getAllByText('1 小时 30 分钟').length).toBeGreaterThan(0);
    expect(screen.getByText('数据库')).toBeInTheDocument();
    expect(screen.getByText('人工智能')).toBeInTheDocument();
    const databaseSlice = screen.getByRole('button', { name: /数据库：1 小时.*占比 67%/ });
    fireEvent.mouseEnter(databaseSlice);
    expect(await within(durationPie).findByText('数据库')).toBeInTheDocument();
    expect(within(durationPie).getByText('占比 67%')).toBeInTheDocument();
    fireEvent.click(databaseSlice);
    fireEvent.mouseLeave(databaseSlice);
    // React 19.2 下离散事件的更新不与 fireEvent 同步落盘，需要等待选中态提交。
    await waitFor(() => expect(databaseSlice).toHaveAttribute('aria-pressed', 'true'));
    expect(within(durationPie).getByText('数据库')).toBeInTheDocument();

    fireEvent.change(yearSelect, { target: { value: '2025' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('from=2025-01-01'),
        expect.anything(),
      ),
    );
    expect(
      await screen.findByText('共计划 730 项：完成 0 · 取消 0 · 待完成 730。'),
    ).toBeInTheDocument();
    const previousYearGrid = screen.getByRole('group', { name: '2025 年每日任务完成贡献图' });
    expect(within(previousYearGrid).getAllByRole('img')).toHaveLength(365);
    expect(previousYearGrid.querySelectorAll('.contribution-cell')).toHaveLength(371);
    expect(screen.getByText('所选范围内还没有学习活动记录。')).toBeInTheDocument();
    expect(screen.getAllByText('与上年同期持平').length).toBeGreaterThan(0);
  });

  it('does not show a misleading zero percent and can retry failures', async () => {
    const empty = {
      from: '2026-01-01',
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
      learningDuration: { totalSeconds: 0, bySeries: [] },
    };
    // 每次调用都要返回新的 Response：body 只能读取一次，而页面会并发请求当前期与上期。
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500))
        .mockImplementation(async () => json(empty)),
    );
    renderPage(<ReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    expect(await screen.findByText('这段时间还没有计划，因此不计算完成率。')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getAllByText('与上年同期持平').length).toBeGreaterThan(0);
    expect(screen.getByText('还没有可统计的合集观看进度。')).toBeInTheDocument();
    expect(screen.getByText('所选范围内还没有学习活动记录。')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '2026 年每日任务完成贡献图' })).toBeInTheDocument();
    expect(screen.getByText('完成 0 项 · 有贡献 0 天 · 最长连续 0 天')).toBeInTheDocument();
  });
});
