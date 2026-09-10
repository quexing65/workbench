import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { addBusinessDays } from '@workbench/shared';
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

function renderApp(path: string) {
  window.history.replaceState({}, '', path);
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppRouter />
    </QueryClientProvider>,
  );
}

function dateInput(): HTMLInputElement {
  return screen.getByLabelText('切换日期') as HTMLInputElement;
}

describe('global shortcuts', () => {
  beforeEach(() => {
    stubHealthFetch();
    setThemeMode('light');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setThemeMode('light');
    delete document.documentElement.dataset['theme'];
  });

  it('navigates with the g prefix and ignores unknown follow-up keys', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: '把今天，安稳地放在眼前。' });

    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(window.location.pathname).toBe('/overview');

    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 't' });
    await waitFor(() => expect(window.location.pathname).toBe('/tasks'));
  });

  it('toggles the theme with d but never while typing', async () => {
    renderApp('/tasks');
    await screen.findByRole('heading', { name: '任务', level: 1 });

    fireEvent.keyDown(screen.getByLabelText('标题'), { key: 'd' });
    expect(document.documentElement.dataset['theme']).toBe('light');

    fireEvent.keyDown(window, { key: 'd' });
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('opens the shortcut sheet with ? and closes it with Escape or ?', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: '把今天，安稳地放在眼前。' });

    fireEvent.keyDown(window, { key: '?' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('键盘快捷键');

    fireEvent.keyDown(window, { key: '?' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: '?' });
    await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('focuses the new-item input with n', async () => {
    renderApp('/tasks');
    await screen.findByRole('heading', { name: '任务', level: 1 });

    fireEvent.keyDown(window, { key: 'n' });
    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveFocus());
  });

  it('steps the task date with [ and ]', async () => {
    renderApp('/tasks');
    await screen.findByRole('heading', { name: '任务', level: 1 });

    const before = dateInput().value;
    fireEvent.keyDown(window, { key: '[' });
    await waitFor(() => expect(dateInput().value).toBe(addBusinessDays(before, -1)));

    fireEvent.keyDown(window, { key: ']' });
    await waitFor(() => expect(dateInput().value).toBe(before));
  });
});
