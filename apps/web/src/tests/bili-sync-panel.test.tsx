import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BiliSyncPanel } from '../pages/learning/BiliSyncPanel';
import { json, requestPath } from './learning-fixtures';

function renderPanel() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BiliSyncPanel />
    </QueryClientProvider>,
  );
}

describe('Bili connection and sync panel', () => {
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

  it('clears credential material after save and never renders it', async () => {
    const sentinel = 'frontend-secret-sentinel';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          expect(JSON.parse(String(init.body))).toEqual({ sessdata: sentinel });
          return json({ present: true, valid: true, userLabel: '已连接' });
        }
        return json({ present: true, valid: true, userLabel: '已连接' });
      }),
    );
    renderPanel();
    const input = await screen.findByLabelText('手工录入 SESSDATA');
    fireEvent.change(input, { target: { value: sentinel } });
    fireEvent.click(screen.getByRole('button', { name: '验证并安全保存' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(document.body.textContent).not.toContain(sentinel);
  });

  it('requires a second explicit action before asking Edge to restart', async () => {
    const requests: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/status')) {
          return json({ present: false, valid: false, userLabel: '未连接' });
        }
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        if (body.forceRestart === false) {
          return json(
            {
              error: {
                code: 'BROWSER_RESTART_REQUIRED',
                message: '需要重新启动所选浏览器后才能读取登录态',
                details: [],
              },
            },
            409,
          );
        }
        return json({ present: true, valid: true, userLabel: '已连接' });
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '连接已开启调试的 Edge' }));
    const restart = await screen.findByRole('button', { name: '确认重启 Edge 并连接' });
    expect(requests).toEqual([{ browser: 'edge', forceRestart: false }]);
    fireEvent.click(restart);
    await waitFor(() =>
      expect(requests).toEqual([
        { browser: 'edge', forceRestart: false },
        { browser: 'edge', forceRestart: true, confirmation: 'restart-browser' },
      ]),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('polls a run to completion and prevents a duplicate start while running', async () => {
    let runReads = 0;
    let starts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/credential/status')) {
          return json({ present: true, valid: true, userLabel: '已连接' });
        }
        if (target.endsWith('/learning/sync') && init?.method === 'POST') {
          starts += 1;
          return json({ runId: '77777777-7777-4777-8777-777777777777' }, 202);
        }
        runReads += 1;
        return json({
          id: '77777777-7777-4777-8777-777777777777',
          status: runReads === 1 ? 'running' : 'succeeded',
          requestedPages: 3,
          historyCount: runReads === 1 ? 0 : 4,
          updatedCount: runReads === 1 ? 0 : 2,
          safeErrorCode: null,
          startedAt: '2026-08-13T01:00:00.000Z',
          finishedAt: runReads === 1 ? null : '2026-08-13T01:00:01.000Z',
          createdAt: '2026-08-13T01:00:00.000Z',
        });
      }),
    );
    renderPanel();
    const start = await screen.findByRole('button', { name: '同步观看历史' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(await screen.findByRole('button', { name: '正在同步…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '正在同步…' }));
    expect(starts).toBe(1);
    expect(await screen.findByText('已读取 4 条记录，更新 2 条进度。')).toBeInTheDocument();
  });
});
