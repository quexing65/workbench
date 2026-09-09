import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../shared/ui/ConfirmDialog';

afterEach(cleanup);

describe('confirm dialog', () => {
  it('focuses the confirm action and runs it once before closing', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        request={{ message: '删除这条任务吗？', confirmLabel: '删除', onConfirm }}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('alertdialog')).toHaveTextContent('删除这条任务吗？');
    const action = screen.getByRole('button', { name: '删除' });
    expect(action).toHaveFocus();

    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels on Escape and renders nothing without a request', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        request={{ message: '删除？', onConfirm: () => undefined }}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(<ConfirmDialog request={null} onCancel={onCancel} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
