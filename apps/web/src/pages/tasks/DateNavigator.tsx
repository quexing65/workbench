import { addBusinessDays, businessToday } from '@workbench/shared';
import { useEffect } from 'react';

import { DATE_STEP_EVENT } from '../../app/shortcuts';

/**
 * 任务页日期导航：前一天 / 回今天 / 后一天 + 原生日期输入。
 * 同时监听全局 [ / ] 快捷键派发的 DATE_STEP_EVENT（detail 为 ±1）。
 */
export function DateNavigator({
  date,
  onDateChange,
}: {
  readonly date: string;
  readonly onDateChange: (date: string) => void;
}) {
  const today = businessToday();
  const step = (delta: number) => onDateChange(addBusinessDays(date, delta));

  useEffect(() => {
    const onStep = (event: Event) => {
      const delta = (event as CustomEvent<number>).detail;
      onDateChange(addBusinessDays(date, delta));
    };
    window.addEventListener(DATE_STEP_EVENT, onStep);
    return () => window.removeEventListener(DATE_STEP_EVENT, onStep);
  }, [date, onDateChange]);

  return (
    <div className="date-navigator">
      <div className="date-navigator__buttons" role="group" aria-label="日期快捷切换">
        <button
          type="button"
          className="button-secondary"
          aria-label="前一天"
          onClick={() => step(-1)}
        >
          ‹ 前一天
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={date === today}
          onClick={() => onDateChange(today)}
        >
          今天
        </button>
        <button
          type="button"
          className="button-secondary"
          aria-label="后一天"
          onClick={() => step(1)}
        >
          后一天 ›
        </button>
      </div>
      <label>
        切换日期
        <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
      </label>
    </div>
  );
}
