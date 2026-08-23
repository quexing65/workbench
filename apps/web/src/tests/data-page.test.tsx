// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataPage } from '../pages/data/DataPage';

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <DataPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('data backup page', () => {
  it('downloads a backup through the browser without receiving a server path', async () => {
    const createObjectUrl = vi.fn(() => 'blob:backup');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Blob(['archive']), {
            status: 200,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': 'attachment; filename="personal-workbench-test.pwbk"',
            },
          }),
      ),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '创建并下载备份' }));
    expect(await screen.findByRole('status')).toHaveTextContent('备份已通过浏览器下载');
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:backup');
    expect(document.body.textContent).not.toContain('C:\\');
    expect(screen.getByText(/整库时间点恢复不是迁移或合并/)).toBeInTheDocument();
  });
});
