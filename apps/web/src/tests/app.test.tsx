import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from '../app/router';

const healthPayload = {
  status: 'ok',
  version: '0.1.0',
  database: 'ok',
  schemaVersion: 3,
  timeZone: 'Asia/Shanghai',
};

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>,
  );
}

describe('Personal Workbench application shell', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(healthPayload), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('redirects the root route to the overview and renders the seven destinations', async () => {
    renderApp();

    expect(
      await screen.findByRole('heading', { name: '把今天，安稳地放在眼前。' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/overview');

    for (const label of ['总览', '任务', '固定任务', '小记', '学习', '回顾', '数据']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('shows validated service health from the shared contract', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getAllByText('本机服务正常').length).toBeGreaterThan(0);
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it.each([
    ['/overview', '把今天，安稳地放在眼前。'],
    ['/tasks', '任务'],
    ['/recurring', '固定任务'],
    ['/notes', '小记'],
    ['/learning', '学习'],
    ['/review', '回顾'],
    ['/data', '数据'],
  ])('renders the fixed route %s', async (path, heading) => {
    window.history.replaceState({}, '', path);
    renderApp();

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
  });

  it('shows a retry action when the local service is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    renderApp();

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '重试' }).length).toBeGreaterThan(0);
  });
});
