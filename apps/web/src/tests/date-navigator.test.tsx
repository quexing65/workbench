import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { addBusinessDays } from '@workbench/shared';
import { useState } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DATE_STEP_EVENT } from '../app/shortcuts';
import { DateNavigator } from '../pages/tasks/DateNavigator';

function Harness({ initial }: { initial: string }) {
  const [date, setDate] = useState(initial);
  return <DateNavigator date={date} onDateChange={setDate} />;
}

function inputValue(): string {
  return (screen.getByLabelText('切换日期') as HTMLInputElement).value;
}

describe('DateNavigator', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-13T04:00:00.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('steps one business day back and forth', () => {
    render(<Harness initial="2026-08-13" />);

    fireEvent.click(screen.getByRole('button', { name: '前一天' }));
    expect(inputValue()).toBe(addBusinessDays('2026-08-13', -1));

    fireEvent.click(screen.getByRole('button', { name: '后一天' }));
    expect(inputValue()).toBe('2026-08-13');
  });

  it('returns to today and disables the button while already there', () => {
    // 冻结时钟在 Asia/Shanghai 的 2026-08-13 中午，businessToday() 即该日。
    vi.setSystemTime(new Date('2026-08-13T04:00:00.000Z'));
    render(<Harness initial="2026-08-13" />);
    const todayButton = screen.getByRole('button', { name: '今天' });
    expect(todayButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '前一天' }));
    expect(todayButton).toBeEnabled();
    fireEvent.click(todayButton);
    expect(inputValue()).toBe('2026-08-13');
  });

  it('reacts to the global [ and ] date-step events', () => {
    render(<Harness initial="2026-08-13" />);

    act(() => {
      window.dispatchEvent(new CustomEvent(DATE_STEP_EVENT, { detail: -1 }));
    });
    expect(inputValue()).toBe(addBusinessDays('2026-08-13', -1));

    act(() => {
      window.dispatchEvent(new CustomEvent(DATE_STEP_EVENT, { detail: 1 }));
    });
    expect(inputValue()).toBe('2026-08-13');
  });
});
