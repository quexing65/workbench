import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '../shared/ui/Toast';

function Trigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.push(`反馈 ${toastCounter()}`)}>
      push
    </button>
  );
}

let pushes = 0;
function toastCounter(): number {
  pushes += 1;
  return pushes;
}

describe('toast feedback', () => {
  beforeEach(() => {
    pushes = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows pushed messages and auto-dismisses them', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.getByText('反馈 1')).toBeInTheDocument();
    expect(screen.getByRole('status', { hidden: false })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(screen.queryByText('反馈 1')).not.toBeInTheDocument();
  });

  it('keeps at most three toasts visible', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: 'push' });
    for (let index = 0; index < 4; index += 1) {
      act(() => {
        fireEvent.click(button);
      });
    }
    expect(screen.queryByText('反馈 1')).not.toBeInTheDocument();
    expect(screen.getByText('反馈 2')).toBeInTheDocument();
    expect(screen.getByText('反馈 4')).toBeInTheDocument();
  });

  it('is a silent no-op when rendered without the provider', () => {
    render(<Trigger />);
    fireEvent.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
