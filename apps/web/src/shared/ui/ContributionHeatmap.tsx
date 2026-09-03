import { addBusinessDays, businessDateSpan, type DayStats } from '@workbench/shared';
import type { ReactNode } from 'react';

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function dateParts(date: string): { day: number; month: number; weekday: number } {
  const parsed = new Date(`${date}T00:00:00Z`);
  return {
    day: parsed.getUTCDate(),
    month: parsed.getUTCMonth() + 1,
    weekday: parsed.getUTCDay(),
  };
}

function cellAriaLabel(day: DayStats): string {
  const pending = Math.max(0, day.planned - day.completed - day.cancelled);
  return `${day.date}：完成 ${day.completed}，计划 ${day.planned}，取消 ${day.cancelled}，待完成 ${pending}，完成率 ${percent(day.completionRate)}，学习活动 ${day.learningActivities} 次`;
}

function contributionLevel(completed: number, maxCompleted: number): number {
  if (completed === 0) return 0;
  return Math.max(1, Math.ceil((completed / maxCompleted) * 4));
}

function longestStreak(days: DayStats[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.completed > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

interface CalendarCell {
  readonly date: string;
  readonly day: DayStats | null;
}

interface ContributionHeatmapProps {
  readonly days: DayStats[];
  /** 网格覆盖的日期窗口（含两端）；按周列排布，窗口内无数据的日期渲染为空格子。 */
  readonly from: string;
  readonly to: string;
  /** 整块网格的可读名称，如「2026 年每日任务完成贡献图」。 */
  readonly label: string;
  /** 受控的激活日期（悬停/聚焦高亮与回调）；不传时格子只读，仅保留读屏信息。 */
  readonly activeDate?: string | null;
  readonly onActiveDateChange?: (date: string | null) => void;
  /** 渲染在网格右上方的工具区，用于年份选择、跳转链接等。 */
  readonly children?: ReactNode;
}

export function ContributionHeatmap({
  days,
  from,
  to,
  label,
  activeDate,
  onActiveDateChange,
  children,
}: ContributionHeatmapProps) {
  const totalDays = businessDateSpan(from, to);
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const startWeekday = dateParts(from).weekday;
  const weekCount = Math.ceil((startWeekday + totalDays) / 7);
  const weeks = Array.from({ length: weekCount }, () => Array<CalendarCell | null>(7).fill(null));

  for (let index = 0; index < totalDays; index += 1) {
    const date = addBusinessDays(from, index);
    const position = startWeekday + index;
    weeks[Math.floor(position / 7)]![position % 7] = { date, day: dayMap.get(date) ?? null };
  }

  const monthLabels = weeks.map((week) => {
    const boundary = week.find((cell) => cell !== null && dateParts(cell.date).day === 1);
    return boundary === undefined || boundary === null ? '' : `${dateParts(boundary.date).month}月`;
  });
  // 汇总只统计窗口内的日子：days 可能覆盖更大范围（如整年数据配滚动窗口）。
  const windowDays = days.filter((day) => day.date >= from && day.date <= to);
  const completedTotal = windowDays.reduce((sum, day) => sum + day.completed, 0);
  const activeDays = windowDays.filter((day) => day.completed > 0).length;
  const maxCompleted = Math.max(1, ...windowDays.map((day) => day.completed));

  return (
    <div className="contribution-panel">
      {children === undefined ? null : <div className="contribution-toolbar">{children}</div>}
      <div
        className="contribution-scroll"
        role="group"
        aria-label={`${label}（可横向滚动）`}
        tabIndex={0}
      >
        <div className="contribution-calendar">
          <div className="contribution-months" aria-hidden="true">
            <span />
            <div
              className="contribution-months__grid"
              style={{ gridTemplateColumns: `repeat(${weekCount}, var(--contribution-cell))` }}
            >
              {monthLabels.map((monthLabel, index) => (
                <span key={`${monthLabel}-${index}`}>{monthLabel}</span>
              ))}
            </div>
          </div>
          <div className="contribution-body">
            <div className="contribution-weekdays" aria-hidden="true">
              <span>一</span>
              <span>三</span>
              <span>五</span>
            </div>
            <div
              className="contribution-grid"
              role="group"
              aria-label={label}
              style={{ gridTemplateColumns: `repeat(${weekCount}, var(--contribution-cell))` }}
            >
              {weeks.flatMap((week, weekIndex) =>
                week.map((cell, weekday) =>
                  cell === null ? (
                    <span
                      key={`empty-${weekIndex}-${weekday}`}
                      className="contribution-cell is-placeholder"
                      aria-hidden="true"
                    />
                  ) : cell.day === null ? (
                    // 窗口内暂无数据的日期（如未来的日子）：与"没有任务"的
                    // 格子同样渲染，保持网格完整；仅边界对齐位保持透明。
                    <span
                      key={cell.date}
                      className="contribution-cell"
                      data-level={0}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      key={cell.date}
                      className={`contribution-cell${activeDate === cell.date ? ' is-active' : ''}`}
                      data-level={contributionLevel(cell.day.completed, maxCompleted)}
                      role="img"
                      aria-label={cellAriaLabel(cell.day)}
                      {...(onActiveDateChange === undefined
                        ? {}
                        : {
                            tabIndex: 0,
                            onMouseEnter: () => onActiveDateChange(cell.date),
                            onMouseLeave: () => onActiveDateChange(null),
                            onFocus: () => onActiveDateChange(cell.date),
                            onBlur: () => onActiveDateChange(null),
                          })}
                    />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="contribution-footer">
        <p>
          完成 {completedTotal} 项 · 有贡献 {activeDays} 天 · 最长连续 {longestStreak(windowDays)}{' '}
          天
        </p>
        <p className="contribution-legend" aria-label="贡献强度图例：少到多">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className="contribution-cell" data-level={level} aria-hidden="true" />
          ))}
          <span>多</span>
        </p>
      </div>
    </div>
  );
}
