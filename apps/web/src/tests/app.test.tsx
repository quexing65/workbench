import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from '../app/router';

const healthPayload = {
  status: 'ok',
  version: '0.1.0',
  database: 'ok',
  schemaVersion: 3,
  timeZone: 'Asia/Shanghai',
};

function stubHealthFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(healthPayload), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    ),
  );
}

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
    stubHealthFetch();
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

describe('responsive sidebar tiers', () => {
  /** 按查询返回 matches 的 matchMedia 替身；AppShell 用它判定 rail / drawer 档位。 */
  function stubMatchMedia(matches: (query: string) => boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: matches(query),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  }

  function shellElement(): Element | null {
    return document.querySelector('.app-shell');
  }

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    stubHealthFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the full sidebar on desktop widths', async () => {
    stubMatchMedia(() => false);
    renderApp();

    expect(
      await screen.findByRole('heading', { name: '把今天，安稳地放在眼前。' }),
    ).toBeInTheDocument();
    const shell = shellElement();
    expect(shell).not.toHaveClass('app-shell--sidebar-collapsed');
    expect(shell).not.toHaveClass('app-shell--rail');
    expect(shell).not.toHaveClass('app-shell--drawer');
    expect(screen.queryByRole('button', { name: '打开导航' })).not.toBeInTheDocument();
  });

  it('narrows to an icon rail between 641px and 1100px', async () => {
    stubMatchMedia((query) => query === '(min-width: 641px) and (max-width: 1100px)');
    renderApp();

    expect(
      await screen.findByRole('heading', { name: '把今天，安稳地放在眼前。' }),
    ).toBeInTheDocument();
    const shell = shellElement();
    expect(shell).toHaveClass('app-shell--sidebar-collapsed');
    expect(shell).toHaveClass('app-shell--rail');
    expect(screen.queryByRole('button', { name: '打开导航' })).not.toBeInTheDocument();
  });

  it('hides the sidebar behind a handle on phone widths and closes via Escape', async () => {
    stubMatchMedia((query) => query === '(max-width: 640px)');
    renderApp();

    const handle = await screen.findByRole('button', { name: '打开导航' });
    const shell = shellElement();
    expect(shell).toHaveClass('app-shell--drawer');
    expect(shell).not.toHaveClass('app-shell--drawer-open');

    fireEvent.click(handle);
    expect(shell).toHaveClass('app-shell--drawer-open');
    expect(screen.getByRole('button', { name: '关闭导航' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(shell).not.toHaveClass('app-shell--drawer-open'));
  });

  it('closes the drawer after picking a destination', async () => {
    stubMatchMedia((query) => query === '(max-width: 640px)');
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: '打开导航' }));
    fireEvent.click(screen.getAllByRole('link', { name: '回顾' })[0]!);
    await waitFor(() => expect(shellElement()).not.toHaveClass('app-shell--drawer-open'));
  });
});
