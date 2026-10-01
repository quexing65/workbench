import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setThemeMode } from '../app/preferences';
import { AppRouter } from '../app/router';

function stubHealthFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          version: '1.6.0',
          database: 'ok',
          schemaVersion: 5,
          timeZone: 'Asia/Shanghai',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    ),
  );
}

function renderApp() {
  window.history.replaceState({}, '', '/overview');
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppRouter />
    </QueryClientProvider>,
  );
}

async function openSettings() {
  fireEvent.click((await screen.findAllByRole('button', { name: '设置' }))[0]!);
  return screen.findByRole('dialog');
}

describe('settings dialog', () => {
  beforeEach(() => {
    setThemeMode('light');
    stubHealthFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setThemeMode('light');
    delete document.documentElement.dataset['theme'];
  });

  it('opens from the sidebar button and shows theme options and the local version', async () => {
    renderApp();

    const dialog = await openSettings();
    expect(dialog).toHaveTextContent('设置');
    expect(screen.getByRole('radio', { name: '浅色' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '深色' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '跟随系统' })).toBeInTheDocument();
    expect(await within(dialog).findByText('v1.6.0')).toBeInTheDocument();
    // 快捷键速查归 ? 浮层，弹窗内不再重复。
    expect(dialog).not.toHaveTextContent('键盘快捷键');
  });

  it('applies the dark theme immediately when chosen', async () => {
    renderApp();
    await openSettings();

    fireEvent.click(screen.getByRole('radio', { name: '深色' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(screen.getByRole('radio', { name: '深色' })).toBeChecked();
    expect(window.localStorage.getItem('workbench-theme')).toBe('dark');
  });

  it('follows the system scheme when asked to', async () => {
    renderApp();
    await openSettings();

    // jsdom 的 matchMedia 固定 matches:false，即系统为浅色。
    fireEvent.click(screen.getByRole('radio', { name: '跟随系统' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(window.localStorage.getItem('workbench-theme')).toBe('system');
  });

  it('closes with Escape, the close button, or the backdrop', async () => {
    renderApp();
    await openSettings();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const dialog = await openSettings();
    fireEvent.mouseDown(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
