import type { DayStats } from '@workbench/shared';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function weekdayLabel(date: string): string {
  return WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

function daySummary(day: DayStats): string {
  return day.planned === 0
    ? `${day.date} 无计划`
    : `${day.date} 完成 ${day.completed} / 计划 ${day.planned}`;
}

/**
 * 近 7 天完成率迷你趋势。服务端 overview 契约早已返回 last7Days，
 * 此前前端一直未渲染；条高为该日完成率，无计划日显示为虚底。
 */
export function WeekTrend({ days }: { days: readonly DayStats[] }) {
  const summary = days.map(daySummary).join('；');
  return (
    <div className="week-trend" role="img" aria-label={`近 7 天完成趋势：${summary}`}>
      <p className="week-trend__caption">近 7 天完成率</p>
      <div className="week-trend__bars" aria-hidden="true">
        {days.map((entry, index) => (
          <div
            className={`week-trend__col${index === days.length - 1 ? ' is-today' : ''}`}
            key={entry.date}
            title={daySummary(entry)}
          >
            <span className="week-trend__track">
              <span
                className="week-trend__fill"
                style={{
                  height: `${entry.completionRate === null ? 0 : Math.round(entry.completionRate * 100)}%`,
                }}
              />
            </span>
            <small>{weekdayLabel(entry.date)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
