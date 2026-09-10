import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BiliSyncPanel } from '../pages/learning/BiliSyncPanel';
import { LearningResourceSync } from '../pages/learning/LearningResourceSync';
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

const resourceId = '55555555-5555-4555-8555-555555555555';

function renderResourceSync() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LearningResourceSync resourceId={resourceId} resourceTitle="同步测试课程" />
    </QueryClientProvider>,
  );
}

describe('Bili connection and sync panel', () => {
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

  it('syncs viewing history from an individual learning resource', async () => {
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
          expect(JSON.parse(String(init.body))).toEqual({ resourceId, pages: 3 });
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
    renderResourceSync();
    const start = await screen.findByRole('button', { name: '同步观看历史 同步测试课程' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    const running = await screen.findByRole('button', { name: '同步观看历史 同步测试课程' });
    expect(running).toBeDisabled();
    fireEvent.click(running);
    expect(starts).toBe(1);
    expect(
      await screen.findByText('已同步此资源：读取 4 条记录，更新 2 条进度。'),
    ).toBeInTheDocument();
  });

  function errorResponse(code: string, message: string, status = 409): Response {
    return json({ error: { code, message, details: [] } }, status);
  }

  it('reads the credential from Edge without restart when discovery succeeds', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/credential/status')) {
          return json(
            calls.length === 0
              ? { present: false, valid: false, userLabel: '未连接' }
              : { present: true, valid: true, userLabel: '已连接' },
          );
        }
        if (target.endsWith('/credential/fetch') && init?.method === 'POST') {
          calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return json({ present: true, valid: true, userLabel: '已连接' });
        }
        return json({});
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '从浏览器读取' }));
    await waitFor(() => expect(calls).toEqual([{ browser: 'edge', forceRestart: false }]));
    expect(await screen.findByText('已连接')).toBeInTheDocument();
  });

  it('confirms before restarting Edge and retries with the confirmation token', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/credential/status')) {
          return json({ present: false, valid: false, userLabel: '未连接' });
        }
        if (target.endsWith('/credential/fetch') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          calls.push(body);
          if (body['forceRestart'] === true) {
            return json({ present: true, valid: true, userLabel: '已连接' });
          }
          return errorResponse(
            'BROWSER_RESTART_REQUIRED',
            '需要重新启动所选浏览器后才能读取登录态',
          );
        }
        return json({});
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '从浏览器读取' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('所有 Edge 窗口会被关闭');
    fireEvent.click(screen.getByRole('button', { name: '重启并读取' }));
    await waitFor(() =>
      expect(calls).toEqual([
        { browser: 'edge', forceRestart: false },
        { browser: 'edge', forceRestart: true, confirmation: 'restart-browser' },
      ]),
    );
  });

  it('does not restart the browser when the user cancels the confirmation', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/credential/status')) {
          return json({ present: false, valid: false, userLabel: '未连接' });
        }
        if (target.endsWith('/credential/fetch') && init?.method === 'POST') {
          calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return errorResponse(
            'BROWSER_RESTART_REQUIRED',
            '需要重新启动所选浏览器后才能读取登录态',
          );
        }
        return json({});
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '从浏览器读取' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls).toEqual([{ browser: 'edge', forceRestart: false }]);
  });

  it('guides Chrome users to Edge or manual entry without offering restart', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/credential/status')) {
          return json({ present: false, valid: false, userLabel: '未连接' });
        }
        if (target.endsWith('/credential/fetch') && init?.method === 'POST') {
          calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return errorResponse(
            'BROWSER_RESTART_REQUIRED',
            '需要重新启动所选浏览器后才能读取登录态',
          );
        }
        return json({});
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('radio', { name: 'Chrome' }));
    fireEvent.click(screen.getByRole('button', { name: '从浏览器读取' }));
    expect(
      await screen.findByText('Chrome 136 及以上版本不支持受控读取，请改用 Edge 或手工录入。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls).toEqual([{ browser: 'chrome', forceRestart: false }]);
  });

  it('surfaces server errors when the browser has no B站 login state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.endsWith('/credential/status')) {
          return json({ present: false, valid: false, userLabel: '未连接' });
        }
        if (target.endsWith('/credential/fetch') && init?.method === 'POST') {
          return errorResponse('BILI_CREDENTIAL_NOT_FOUND', '浏览器中没有可用的 B站登录态', 404);
        }
        return json({});
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '从浏览器读取' }));
    expect(await screen.findByText('浏览器中没有可用的 B站登录态')).toBeInTheDocument();
  });
});
