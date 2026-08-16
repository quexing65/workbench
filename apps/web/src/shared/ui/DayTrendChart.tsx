import type { DayStats } from '@workbench/shared';
import { useState } from 'react';

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function columnAriaLabel(day: DayStats, pending: number): string {
  return `${day.date}：计划 ${day.planned}，完成 ${day.completed}，取消 ${day.cancelled}，待完成 ${pending}，完成率 ${percent(day.completionRate)}，学习活动 ${day.learningActivities} 次`;
}

export interface DayTrendChartProps {
  readonly days: DayStats[];
  readonly chartLabel: string;
  /** 超过 7 天时只保留稀疏的日期标签。 */
  readonly compact?: boolean;
  /** sm 用于总览等小空间，md 用于回顾页。 */
  readonly size?: 'sm' | 'md';
  /** 受控的激活日期（悬停/聚焦）；不传时组件内部自行维护。 */
  readonly activeDate?: string | null;
  readonly onActiveDateChange?: (date: string | null) => void;
}

export function DayTrendChart({
  days,
  chartLabel,
  compact = false,
  size = 'md',
  activeDate,
  onActiveDateChange,
}: DayTrendChartProps) {
  const [internalActiveDate, setInternalActiveDate] = useState<string | null>(null);
  const active = activeDate !== undefined ? activeDate : internalActiveDate;
  const setActiveDate = onActiveDateChange ?? setInternalActiveDate;
  const maxPlanned = Math.max(1, ...days.map((day) => day.planned));

  return (
    <div className={`day-chart day-chart--${size}`} role="group" aria-label={chartLabel}>
      {days.map((day, index) => {
        const pending = Math.max(0, day.planned - day.completed - day.cancelled);
        const showDateLabel =
          !compact || index === 0 || index === days.length - 1 || (index + 1) % 5 === 0;
        return (
          <div
            key={day.date}
            className={`day-chart__col${active === day.date ? ' is-active' : ''}`}
            role="img"
            tabIndex={0}
            aria-label={columnAriaLabel(day, pending)}
            onMouseEnter={() => setActiveDate(day.date)}
            onMouseLeave={() => setActiveDate(null)}
            onFocus={() => setActiveDate(day.date)}
            onBlur={() => setActiveDate(null)}
          >
            <div
              className={`day-chart__stack${day.planned === 0 ? ' is-empty' : ''}`}
              style={
                day.planned === 0 ? undefined : { height: `${(day.planned / maxPlanned) * 100}%` }
              }
            >
              {pending > 0 ? (
                <span className="day-chart__seg is-pending" style={{ flexGrow: pending }} />
              ) : null}
              {day.cancelled > 0 ? (
                <span className="day-chart__seg is-cancelled" style={{ flexGrow: day.cancelled }} />
              ) : null}
              {day.completed > 0 ? (
                <span className="day-chart__seg is-completed" style={{ flexGrow: day.completed }} />
              ) : null}
            </div>
            <b>{compact ? '' : percent(day.completionRate)}</b>
            <small>{showDateLabel ? day.date.slice(5) : ''}</small>
          </div>
        );
      })}
    </div>
  );
}
