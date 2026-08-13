import { useQuery } from '@tanstack/react-query';
import { addBusinessDays, type DayStats } from '@workbench/shared';
import { useState } from 'react';

import { getReview } from '../../shared/api/insights';
import { queryKeys } from '../../shared/api/query-keys';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function ReviewChart({ days }: { days: DayStats[] }) {
  return (
    <>
      <div className="review-chart" role="img" aria-label="每日任务完成率柱状图">
        {days.map((day) => (
          <div className="review-chart__day" key={day.date}>
            <span
              className="review-chart__bar"
              style={{ height: `${(day.completionRate ?? 0) * 100}%` }}
            />
            <small>{day.date.slice(5)}</small>
          </div>
        ))}
      </div>
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
    </>
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
      {review.data ? (
        <>
          <dl className="review-totals">
            <div>
              <dt>计划</dt>
              <dd>{review.data.totals.planned}</dd>
            </div>
            <div>
              <dt>完成</dt>
              <dd>{review.data.totals.completed}</dd>
            </div>
            <div>
              <dt>取消</dt>
              <dd>{review.data.totals.cancelled}</dd>
            </div>
            <div>
              <dt>完成率</dt>
              <dd>{percent(review.data.totals.completionRate)}</dd>
            </div>
            <div>
              <dt>学习活动</dt>
              <dd>{review.data.totals.learningActivities}</dd>
            </div>
          </dl>
          {review.data.totals.planned === 0 ? (
            <p className="review-empty">这段时间还没有计划，因此不计算完成率。</p>
          ) : null}
          <ReviewChart days={review.data.days} />
        </>
      ) : null}
    </section>
  );
}
