import { useQuery } from '@tanstack/react-query';
import { addBusinessDays, type DayStats, type ReviewResponse } from '@workbench/shared';
import { useState } from 'react';

import { getReview } from '../../shared/api/insights';
import { queryKeys } from '../../shared/api/query-keys';
import { DayTrendChart } from '../../shared/ui/DayTrendChart';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

const PIE_COLORS = ['#315f50', '#d3794d', '#71899b', '#a2865f', '#74658d', '#5f8b75'];

function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

function DeltaBadge({
  delta,
  format,
  threshold = 1,
}: {
  delta: number | null;
  format: (delta: number) => string;
  threshold?: number;
}) {
  if (delta === null) return null;
  if (Math.abs(delta) < threshold) {
    return <small className="review-stat__delta is-flat">与上期持平</small>;
  }
  const up = delta > 0;
  return (
    <small className={`review-stat__delta${up ? ' is-up' : ' is-down'}`}>
      {up ? '↑' : '↓'} 较上期 {format(delta)}
    </small>
  );
}

function StudyDurationPie({ data }: { data: ReviewResponse['learningDuration'] }) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
  const slices = data.bySeries.map((item, index) => {
    const share = item.durationSeconds / data.totalSeconds;
    const start = data.bySeries
      .slice(0, index)
      .reduce((total, previous) => total + previous.durationSeconds / data.totalSeconds, 0);
    return {
      ...item,
      color: PIE_COLORS[index % PIE_COLORS.length]!,
      share,
      start: start * 100,
      end: (start + share) * 100,
    };
  });
  const activeIndex = hoveredSlice ?? selectedSlice;
  const activeSlice = activeIndex === null ? null : (slices[activeIndex] ?? null);

  function toggleSlice(index: number) {
    setSelectedSlice((current) => (current === index ? null : index));
  }

  return (
    <section className="review-study-card" aria-labelledby="study-duration-title">
      <div className="review-study-card__header">
        <div>
          <p className="eyebrow">学习投入</p>
          <h2 id="study-duration-title">观看进度</h2>
        </div>
        <p>按合集统计当前观看时刻距合集开头的时长；回看回退、跳过的内容按位置直接计。</p>
      </div>
      {slices.length === 0 ? (
        <p className="review-empty">还没有可统计的合集观看进度。</p>
      ) : (
        <div className="review-study-content">
          <div
            className={`review-study-pie${activeIndex === null ? '' : ' has-active'}`}
            role="group"
            aria-label={`观看进度系列分布，总计 ${durationLabel(data.totalSeconds)}`}
          >
            <svg viewBox="0 0 100 100" aria-hidden="false">
              <circle className="review-study-pie__track" cx="50" cy="50" r="40" />
              {slices.map((slice, index) => (
                <circle
                  key={slice.seriesId ?? 'uncategorized'}
                  className={`review-study-pie__slice${activeIndex === index ? ' is-active' : ''}`}
                  cx="50"
                  cy="50"
                  r="40"
                  pathLength="100"
                  strokeDasharray={`${slice.share * 100} ${100 - slice.share * 100}`}
                  strokeDashoffset={-slice.start}
                  style={{ stroke: slice.color }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${slice.seriesName}：${durationLabel(slice.durationSeconds)}，占比 ${percent(slice.share)}`}
                  aria-pressed={selectedSlice === index}
                  onMouseEnter={() => setHoveredSlice(index)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  onFocus={() => setHoveredSlice(index)}
                  onBlur={() => setHoveredSlice(null)}
                  onClick={() => toggleSlice(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleSlice(index);
                    }
                  }}
                />
              ))}
            </svg>
            <div>
              <strong>{activeSlice?.seriesName ?? durationLabel(data.totalSeconds)}</strong>
              <small>
                {activeSlice === null ? '各合集当前进度合计' : `占比 ${percent(activeSlice.share)}`}
              </small>
            </div>
          </div>
          <ul className="review-study-legend" aria-label="学习系列进度图例">
            {slices.map((slice) => (
              <li key={slice.seriesId ?? 'uncategorized'}>
                <span className="review-study-swatch" style={{ background: slice.color }} />
                <div>
                  <strong>{slice.seriesName}</strong>
                  <small>{durationLabel(slice.durationSeconds)}</small>
                </div>
                <b>{percent(slice.share)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ActivityRhythm({ days }: { days: DayStats[] }) {
  const total = days.reduce((sum, day) => sum + day.learningActivities, 0);
  const activeCount = days.filter((day) => day.learningActivities > 0).length;
  const max = Math.max(...days.map((day) => day.learningActivities));
  const peakDay = days.reduce<DayStats | null>(
    (peak, day) => (peak === null || day.learningActivities > peak.learningActivities ? day : peak),
    null,
  );

  return (
    <section
      className="review-study-card review-rhythm-card"
      aria-labelledby="activity-rhythm-title"
    >
      <div className="review-study-card__header">
        <div>
          <p className="eyebrow">学习节奏</p>
          <h2 id="activity-rhythm-title">活跃热区</h2>
        </div>
        <p>每天一格，颜色越深表示当天学习活动越多，空格代表没有学习记录。</p>
      </div>
      {total === 0 ? (
        <p className="review-empty">所选范围内还没有学习活动记录。</p>
      ) : (
        <>
          <div className="review-rhythm__grid" role="group" aria-label="每日学习活动热度">
            {days.map((day) => {
              const intensity =
                day.learningActivities === 0
                  ? 0
                  : Math.round((0.24 + (day.learningActivities / max) * 0.76) * 100);
              return (
                <span
                  key={day.date}
                  className={`review-rhythm__cell${day.learningActivities === 0 ? ' is-empty' : ''}`}
                  role="img"
                  aria-label={`${day.date}：学习活动 ${day.learningActivities} 次`}
                  style={
                    intensity === 0
                      ? undefined
                      : {
                          background: `color-mix(in srgb, var(--accent) ${intensity}%, var(--paper))`,
                        }
                  }
                />
              );
            })}
          </div>
          <p className="review-rhythm__meta">
            学习活动 {total} 次 · 有记录 {activeCount} 天
            {peakDay !== null && peakDay.learningActivities > 0
              ? ` · 最活跃 ${peakDay.date.slice(5)}（${peakDay.learningActivities} 次）`
              : ''}
          </p>
        </>
      )}
    </section>
  );
}

function DailySection({ days }: { days: DayStats[] }) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const compact = days.length > 7;
  const activeDay = days.find((day) => day.date === activeDate) ?? null;

  return (
    <section className="review-detail-card" aria-labelledby="daily-review-title">
      <div className="review-section-header">
        <div>
          <p className="eyebrow">按日查看</p>
          <h2 id="daily-review-title">每日趋势与明细</h2>
        </div>
        <p className="day-chart-readout" aria-live="polite">
          {activeDay === null ? (
            <span>悬停或聚焦柱子查看当天明细，共 {days.length} 天。</span>
          ) : (
            <>
              <strong>{activeDay.date}</strong>
              <span>
                完成 {activeDay.completed} / 计划 {activeDay.planned}
              </span>
              {activeDay.cancelled > 0 ? <span>取消 {activeDay.cancelled}</span> : null}
              <span>完成率 {percent(activeDay.completionRate)}</span>
              <span>学习活动 {activeDay.learningActivities} 次</span>
            </>
          )}
        </p>
      </div>
      <DayTrendChart
        days={days}
        chartLabel="每日计划、完成、取消堆叠柱状图"
        compact={compact}
        activeDate={activeDate}
        onActiveDateChange={setActiveDate}
      />
      <p className="day-chart-legend" aria-hidden="true">
        <span>
          <i className="day-chart-legend__dot is-completed" />
          完成
        </span>
        <span>
          <i className="day-chart-legend__dot is-cancelled" />
          取消
        </span>
        <span>
          <i className="day-chart-legend__dot is-pending" />
          待完成
        </span>
      </p>
      <DailyTable days={days} />
    </section>
  );
}

function DailyTable({ days }: { days: DayStats[] }) {
  return (
    <div className="review-table-wrap">
      <table>
        <caption>每日计划、完成、取消和学习活动明细</caption>
        <thead>
          <tr>
            <th>日期</th>
            <th>计划</th>
            <th>完成</th>
            <th>取消</th>
            <th>完成率</th>
            <th>学习</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th>{day.date}</th>
              <td>{day.planned}</td>
              <td>{day.completed}</td>
              <td>{day.cancelled}</td>
              <td>{percent(day.completionRate)}</td>
              <td>{day.learningActivities}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewPage() {
  const [range, setRange] = useState<7 | 30>(7);
  const to = today();
  const from = addBusinessDays(to, 1 - range);
  const review = useQuery({
    queryKey: queryKeys.review(from, to),
    queryFn: ({ signal }) => getReview(from, to, signal),
  });
  // 上一个等长区间，仅用于结论层的环比角标。
  const previousFrom = addBusinessDays(from, -range);
  const previousTo = addBusinessDays(from, -1);
  const previous = useQuery({
    queryKey: queryKeys.review(previousFrom, previousTo),
    queryFn: ({ signal }) => getReview(previousFrom, previousTo, signal),
  });

  const totals = review.data?.totals ?? null;
  const previousData = previous.data ?? null;
  const activeDays = review.data?.days.filter((day) => day.learningActivities > 0).length ?? null;
  const previousActiveDays =
    previousData?.days.filter((day) => day.learningActivities > 0).length ?? null;
  const deltas =
    totals !== null && previousData !== null && activeDays !== null && previousActiveDays !== null
      ? {
          rate:
            totals.completionRate !== null && previousData.totals.completionRate !== null
              ? (totals.completionRate - previousData.totals.completionRate) * 100
              : null,
          completed: totals.completed - previousData.totals.completed,
          activeDays: activeDays - previousActiveDays,
        }
      : null;
  const pendingTotal =
    totals === null ? null : Math.max(0, totals.planned - totals.completed - totals.cancelled);

  return (
    <section className="page business-page" aria-labelledby="review-title">
      <header className="page-header review-header">
        <div>
          <p className="eyebrow">回望轨迹</p>
          <h1 id="review-title">回顾</h1>
          <p className="page-lead">从真实记录里看见完成与积累；没有计划时，不虚构完成率。</p>
        </div>
        <div className="range-toggle" role="group" aria-label="回顾范围">
          <button
            className={range === 7 ? '' : 'button-secondary'}
            aria-pressed={range === 7}
            onClick={() => setRange(7)}
          >
            近 7 天
          </button>
          <button
            className={range === 30 ? '' : 'button-secondary'}
            aria-pressed={range === 30}
            onClick={() => setRange(30)}
          >
            近 30 天
          </button>
        </div>
      </header>
      {review.isPending ? (
        <p role="status" className="review-state">
          正在整理回顾…
        </p>
      ) : null}
      {review.isError ? (
        <div role="alert" className="review-state">
          <p>回顾加载失败。</p>
          <button onClick={() => review.refetch()}>重试</button>
        </div>
      ) : null}
      {review.data && totals !== null ? (
        <>
          <dl className="review-stats">
            <div className="review-stat">
              <dt>完成率</dt>
              <dd>{percent(totals.completionRate)}</dd>
              <DeltaBadge
                delta={deltas === null ? null : deltas.rate}
                format={(delta) => `${delta > 0 ? '+' : ''}${Math.round(delta)}%`}
              />
            </div>
            <div className="review-stat">
              <dt>完成任务</dt>
              <dd>{totals.completed}</dd>
              <DeltaBadge
                delta={deltas === null ? null : deltas.completed}
                format={(delta) => `${delta > 0 ? '+' : ''}${delta} 项`}
              />
            </div>
            <div className="review-stat">
              <dt>观看进度</dt>
              <dd>{durationLabel(review.data.learningDuration.totalSeconds)}</dd>
              <small className="review-stat__delta is-flat">当前状态，不随区间变化</small>
            </div>
            <div className="review-stat">
              <dt>活跃天数</dt>
              <dd>
                {activeDays ?? 0} / {review.data.days.length} 天
              </dd>
              <DeltaBadge
                delta={deltas === null ? null : deltas.activeDays}
                format={(delta) => `${delta > 0 ? '+' : ''}${delta} 天`}
              />
            </div>
          </dl>
          {totals.planned > 0 ? (
            <p className="review-stats-meta">
              共计划 {totals.planned} 项：完成 {totals.completed} · 取消 {totals.cancelled} · 待完成{' '}
              {pendingTotal}。
            </p>
          ) : null}
          {totals.planned === 0 ? (
            <p className="review-empty">这段时间还没有计划，因此不计算完成率。</p>
          ) : null}
          <div className="review-summary-grid">
            <StudyDurationPie data={review.data.learningDuration} />
            <ActivityRhythm days={review.data.days} />
          </div>
          <DailySection days={review.data.days} />
        </>
      ) : null}
    </section>
  );
}
