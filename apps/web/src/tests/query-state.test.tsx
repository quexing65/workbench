import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryError, QueryLoading } from '../shared/ui/QueryState';

describe('query state blocks', () => {
  it('announces a loading message as a status region', () => {
    render(<QueryLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载…');
  });

  it('renders the message as an alert and calls the retry action', () => {
    const onRetry = vi.fn();
    render(
      <QueryError message="任务加载失败。" onRetry={onRetry}>
        <p>补充说明</p>
      </QueryError>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('任务加载失败。');
    expect(alert).toHaveTextContent('补充说明');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
