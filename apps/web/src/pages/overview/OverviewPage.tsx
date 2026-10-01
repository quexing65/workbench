import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { getOverview } from '../../shared/api/insights';
import { businessToday } from '../../shared/api/business-time';
import { queryKeys } from '../../shared/api/query-keys';
import { createTask, updateTask } from '../../shared/api/tasks';
import { QueryError, QueryLoading } from '../../shared/ui/QueryState';
import { useToast } from '../../shared/ui/Toast';

const OVERDUE_BATCH_SIZE = 20;

/**
 * 业务日 → 「2026 年 9 月 29 日 星期二」。按 UTC 解析业务日，
 * 避免本机时区把日期挪到前一天。
 */
function longDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function resumePositionLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒处`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const position = hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
  return `${position}处`;
}

/** 今天之后的三节跟进内容共用：一个标题 + 一组行。 */
function FollowUp({
  title,
  titleId,
  children,
}: {
  readonly title: string;
  readonly titleId: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="day-followup" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {children}
    </section>
  );
}

export function OverviewPage() {
  const date = businessToday();
  const [title, setTitle] = useState('');
  const [visibleOverdueCount, setVisibleOverdueCount] = useState(OVERDUE_BATCH_SIZE);
  const client = useQueryClient();
  const toast = useToast();
  const overview = useQuery({
    queryKey: queryKeys.overview(date),
    queryFn: ({ signal }) => getOverview(date, signal),
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.overview(date) }),
      client.invalidateQueries({ queryKey: queryKeys.tasks(date) }),
    ]);
  };
  const quickAdd = useMutation({
    mutationFn: () => createTask({ title, description: '', date }),
    onSuccess: async () => {
      setTitle('');
      toast.push('已添加今天的任务');
      await refresh();
    },
  });
  const move = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      updateTask(id, revision, { date }),
    // REVISION_CONFLICT 后本地 revision 已过期；刷新拿到最新数据，避免重试必然再失败
    onSuccess: () => {
      toast.push('已移到今天');
      return refresh();
    },
    onError: refresh,
  });
  const retry = () => {
    void overview.refetch();
  };

  const data = overview.data;
  const today = data?.today;
  const overdueTasks = data?.overdueTasks ?? [];
  const visibleOverdueTasks = overdueTasks.slice(0, visibleOverdueCount);
  const remainingOverdueTasks = overdueTasks.length - visibleOverdueTasks.length;
  const focus = today?.items.find((item) => item.status === 'active') ?? null;
  const rate = today === undefined || today.planned === 0 ? null : today.completed / today.planned;
  const progress = rate === null ? 0 : Math.round(rate * 100);

  function submit(event: FormEvent) {
    event.preventDefault();
    quickAdd.mutate();
  }

  return (
    <section className="page page--day" aria-labelledby="overview-title">
      <header className="day-header">
        <h1 id="overview-title">总览</h1>
        <p className="day-header__meta">
          <time dateTime={date}>{longDate(date)}</time>
        </p>
      </header>

      {overview.isPending ? <QueryLoading message="正在读取今天的数据…" /> : null}
      {overview.isError ? <QueryError message="今天的概览没有加载成功。" onRetry={retry} /> : null}

      {data !== undefined ? (
        <>
          <section className="day-card" aria-labelledby="today-title">
            <h2 id="today-title">今天</h2>

            <div
              className="day-progress"
              role="progressbar"
              aria-label="今日完成进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={rate === null ? '今天还没有计划' : `已完成 ${progress}%`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="day-progress__counts">
              {today === undefined || today.planned === 0
                ? '今天还没有计划，因此不计算完成率。'
                : `完成 ${today.completed} / 计划 ${today.planned} · 待办 ${today.active}${
                    today.cancelled > 0 ? ` · 取消 ${today.cancelled}` : ''
                  }`}
            </p>

            {focus !== null ? (
              <div className="day-focus">
                <h3>{focus.title}</h3>
                {focus.description ? <p>{focus.description}</p> : null}
              </div>
            ) : (
              <p className="empty-state">今天没有等待完成的任务，给自己留一点余白吧。</p>
            )}

            <form className="quick-add" onSubmit={submit}>
              <label htmlFor="quick-task">快速添加今天的任务</label>
              <div>
                <input
                  id="quick-task"
                  required
                  data-shortcut="new"
                  maxLength={500}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="现在最值得完成的是什么？"
                />
                <button disabled={quickAdd.isPending}>
                  {quickAdd.isPending ? '添加中…' : '添加'}
                </button>
              </div>
              {quickAdd.error ? (
                <p role="alert" className="form-error">
                  {quickAdd.error.message}
                </p>
              ) : null}
            </form>
          </section>

          <div className="day-grid">
            <FollowUp
              title={overdueTasks.length > 0 ? `过期待办 · ${overdueTasks.length}` : '过期待办'}
              titleId="overdue-title"
            >
              {overdueTasks.length === 0 ? <p className="empty-state">没有逾期任务。</p> : null}
              <ul className="day-rows">
                {visibleOverdueTasks.map((task) => (
                  <li className="day-row" key={task.id}>
                    <div className="day-row__main">
                      <strong>{task.title}</strong>
                      <small>{task.date}</small>
                    </div>
                    <button
                      className="button-secondary"
                      disabled={move.isPending}
                      onClick={() => move.mutate(task)}
                    >
                      移到今天
                    </button>
                  </li>
                ))}
              </ul>
              {remainingOverdueTasks > 0 ? (
                <button
                  className="button-secondary"
                  onClick={() => setVisibleOverdueCount((count) => count + OVERDUE_BATCH_SIZE)}
                >
                  再显示 {Math.min(OVERDUE_BATCH_SIZE, remainingOverdueTasks)} 条（剩余{' '}
                  {remainingOverdueTasks} 条）
                </button>
              ) : null}
              {overdueTasks.length > 0 ? (
                <p className="day-followup__link">
                  <Link className="text-link" to="/overdue">
                    处理全部逾期任务 →
                  </Link>
                </p>
              ) : null}
              {move.error ? (
                <p role="alert" className="form-error">
                  移动失败，请刷新后重试。
                </p>
              ) : null}
            </FollowUp>

            <FollowUp title="继续学习" titleId="learning-title">
              {data.nextLearning !== null ? (
                <div className="day-row">
                  <div className="day-row__main">
                    <h3>{data.nextLearning.title}</h3>
                    <small>
                      {data.nextLearning.resumePartTitle} ·{' '}
                      {resumePositionLabel(data.nextLearning.resumeSeconds)}
                    </small>
                  </div>
                  <Link className="text-link" to="/learning">
                    打开学习页
                  </Link>
                </div>
              ) : (
                <p className="empty-state">还没有可续接的学习进度。</p>
              )}
            </FollowUp>

            <FollowUp title="最近小记" titleId="notes-title">
              {data.recentNotes.length === 0 ? <p className="empty-state">还没有小记。</p> : null}
              <ul className="day-rows day-notes">
                {data.recentNotes.map((note) => (
                  <li className="day-row" key={note.id}>
                    {note.content}
                  </li>
                ))}
              </ul>
              <p className="day-followup__link">
                <Link className="text-link" to="/notes">
                  查看全部小记 →
                </Link>
              </p>
            </FollowUp>
          </div>
        </>
      ) : null}
    </section>
  );
}
