import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setThemeMode } from '../app/preferences';
import { SettingsPage } from '../pages/settings/SettingsPage';

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

function renderPage() {
  return render(
    <BrowserRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SettingsPage />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

describe('settings page', () => {
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

  it('renders theme options, the shortcut reference and the local version', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '设置', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '浅色' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '深色' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '跟随系统' })).toBeInTheDocument();
    expect(screen.getByText('打开 / 关闭本速查表')).toBeInTheDocument();
    expect(screen.getAllByText('G').length).toBeGreaterThan(0);
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(await screen.findByText('v1.6.0')).toBeInTheDocument();
  });

  it('applies the dark theme immediately when chosen', async () => {
    renderPage();
    await screen.findByRole('heading', { name: '设置', level: 1 });

    fireEvent.click(screen.getByRole('radio', { name: '深色' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(screen.getByRole('radio', { name: '深色' })).toBeChecked();
    expect(window.localStorage.getItem('workbench-theme')).toBe('dark');
  });

  it('follows the system scheme when asked to', async () => {
    renderPage();
    await screen.findByRole('heading', { name: '设置', level: 1 });

    // jsdom 的 matchMedia 固定 matches:false，即系统为浅色。
    fireEvent.click(screen.getByRole('radio', { name: '跟随系统' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(window.localStorage.getItem('workbench-theme')).toBe('system');
  });
});
