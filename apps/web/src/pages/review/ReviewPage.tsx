import { useQuery } from '@tanstack/react-query';
import { addBusinessDays, type DayStats, type ReviewResponse } from '@workbench/shared';
import { useState } from 'react';

import { getReview } from '../../shared/api/insights';
import { queryKeys } from '../../shared/api/query-keys';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

const DAYS_PER_PAGE = 7;
const PIE_COLORS = ['#315f50', '#d3794d', '#71899b', '#a2865f', '#74658d', '#5f8b75'];

function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

function ReviewChart({ days }: { days: DayStats[] }) {
  return (
    <div className="review-chart" role="img" aria-label="当前页每日任务完成率柱状图">
      {days.map((day) => (
        <div className="review-chart__day" key={day.date}>
          <span
            className="review-chart__bar"
            style={{ height: `${(day.completionRate ?? 0) * 100}%` }}
          />
          <b>{percent(day.completionRate)}</b>
          <small>{day.date.slice(5)}</small>
        </div>
      ))}
    </div>
  );
}

function SummaryTables({ data }: { data: ReviewResponse }) {
  const pending = Math.max(0, data.totals.planned - data.totals.completed - data.totals.cancelled);
  const share = (value: number) =>
    data.totals.planned === 0 ? '—' : percent(value / data.totals.planned);
  const activeDays = data.days.filter((day) => day.learningActivities > 0).length;
  const peakDay = data.days.reduce<DayStats | null>(
    (peak, day) => (peak === null || day.learningActivities > peak.learningActivities ? day : peak),
    null,
  );

  return (
    <>
      <section className="review-table-card" aria-labelledby="task-outcome-title">
        <h2 id="task-outcome-title">任务结果</h2>
        <table>
          <caption>所选范围任务状态汇总</caption>
          <thead>
            <tr>
              <th>状态</th>
              <th>数量</th>
              <th>占计划</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>已完成</th>
              <td>{data.totals.completed}</td>
              <td>{share(data.totals.completed)}</td>
            </tr>
            <tr>
              <th>已取消</th>
              <td>{data.totals.cancelled}</td>
              <td>{share(data.totals.cancelled)}</td>
            </tr>
            <tr>
              <th>待完成</th>
              <td>{pending}</td>
              <td>{share(pending)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="review-table-card" aria-labelledby="learning-activity-title">
        <h2 id="learning-activity-title">学习活跃度</h2>
        <table>
          <caption>所选范围学习活动汇总</caption>
          <tbody>
            <tr>
              <th>有学习记录的天数</th>
              <td>{activeDays} 天</td>
            </tr>
            <tr>
              <th>学习活动总数</th>
              <td>{data.totals.learningActivities}</td>
            </tr>
            <tr>
              <th>日均学习活动</th>
              <td>{(data.totals.learningActivities / data.days.length).toFixed(1)}</td>
            </tr>
            <tr>
              <th>最活跃日期</th>
              <td>
                {peakDay !== null && peakDay.learningActivities > 0
                  ? `${peakDay.date} · ${peakDay.learningActivities} 次`
                  : '暂无记录'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
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
          <h2 id="study-duration-title">学习时长</h2>
        </div>
        <p>按实际播放估算：倍速观看按原速时长计，拖动跳过不计，并按学习系列归类。</p>
      </div>
      {slices.length === 0 ? (
        <p className="review-empty">所选范围内还没有可统计的学习时长。</p>
      ) : (
        <div className="review-study-content">
          <div
            className={`review-study-pie${activeIndex === null ? '' : ' has-active'}`}
            role="group"
            aria-label={`学习时长系列分布，总计 ${durationLabel(data.totalSeconds)}`}
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
                {activeSlice === null ? '实际观看总时长' : `占比 ${percent(activeSlice.share)}`}
              </small>
            </div>
          </div>
          <ul className="review-study-legend" aria-label="学习系列时长图例">
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

function DatePager({
  days,
  page,
  pageCount,
  onPageChange,
}: {
  days: DayStats[];
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="review-date-pager" aria-label="回顾日期分页">
      <p>
        {days[0]?.date} – {days.at(-1)?.date}
        <small>
          第 {page + 1} / {pageCount} 页
        </small>
      </p>
      <div>
        <button
          type="button"
          className="button-secondary"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          更早日期
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          更新日期
        </button>
      </div>
    </nav>
  );
}

export function ReviewPage() {
  const [range, setRange] = useState<7 | 30>(7);
  const [datePage, setDatePage] = useState(0);
  const to = today();
  const from = addBusinessDays(to, 1 - range);
  const review = useQuery({
    queryKey: queryKeys.review(from, to),
    queryFn: ({ signal }) => getReview(from, to, signal),
  });
  const pageCount = Math.max(1, Math.ceil((review.data?.days.length ?? 0) / DAYS_PER_PAGE));
  const currentPage = Math.min(datePage, pageCount - 1);
  const pageEnd = review.data ? review.data.days.length - currentPage * DAYS_PER_PAGE : 0;
  const visibleDays = review.data
    ? review.data.days.slice(Math.max(0, pageEnd - DAYS_PER_PAGE), pageEnd)
    : [];

  function selectRange(nextRange: 7 | 30) {
    setRange(nextRange);
    setDatePage(0);
  }

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
            onClick={() => selectRange(7)}
          >
            近 7 天
          </button>
          <button
            className={range === 30 ? '' : 'button-secondary'}
            aria-pressed={range === 30}
            onClick={() => selectRange(30)}
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
          <div className="review-summary-grid">
            <SummaryTables data={review.data} />
            <StudyDurationPie data={review.data.learningDuration} />
          </div>
          <section className="review-detail-card" aria-labelledby="daily-review-title">
            <div className="review-section-header">
              <div>
                <p className="eyebrow">按日查看</p>
                <h2 id="daily-review-title">每日趋势与明细</h2>
              </div>
              <DatePager
                days={visibleDays}
                page={currentPage}
                pageCount={pageCount}
                onPageChange={setDatePage}
              />
            </div>
            <ReviewChart days={visibleDays} />
            <DailyTable days={visibleDays} />
          </section>
        </>
      ) : null}
    </section>
  );
}
