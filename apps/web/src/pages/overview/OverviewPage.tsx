import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OverviewResponse } from '@workbench/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { getOverview } from '../../shared/api/insights';
import { queryKeys } from '../../shared/api/query-keys';
import { createTask, updateTask } from '../../shared/api/tasks';

const OVERDUE_BATCH_SIZE = 20;

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

interface BlockProps {
  readonly title: string;
  readonly label: string;
  readonly pending: boolean;
  readonly error: boolean;
  readonly retry: () => void;
  readonly children: ReactNode;
  readonly primary?: boolean;
}

function Block({ title, label, pending, error, retry, children, primary = false }: BlockProps) {
  return (
    <article className={`surface insight-block${primary ? ' surface--primary' : ''}`}>
      <p className="surface__label">{label}</p>
      <h2>{title}</h2>
      {pending ? <p role="status">正在加载…</p> : null}
      {error ? (
        <div role="alert" className="block-error">
          <p>这部分暂时没有加载成功。</p>
          <button className="button-secondary" onClick={retry}>
            重试
          </button>
        </div>
      ) : (
        children
      )}
    </article>
  );
}

function Summary({ data }: { data: OverviewResponse }) {
  const focus = data.today.items.find((item) => item.status === 'active');
  return (
    <>
      {focus ? (
        <div className="focus-task">
          <span className="status-pill">最重要的下一件事</span>
          <h3>{focus.title}</h3>
          {focus.description ? <p>{focus.description}</p> : null}
        </div>
      ) : (
        <p className="empty-state">今天没有等待完成的任务，给自己留一点余白吧。</p>
      )}
      <dl className="summary-stats">
        <div>
          <dt>计划</dt>
          <dd>{data.today.planned}</dd>
        </div>
        <div>
          <dt>完成</dt>
          <dd>{data.today.completed}</dd>
        </div>
        <div>
          <dt>待办</dt>
          <dd>{data.today.active}</dd>
        </div>
      </dl>
    </>
  );
}

export function OverviewPage() {
  const date = today();
  const [title, setTitle] = useState('');
  const [visibleOverdueCount, setVisibleOverdueCount] = useState(OVERDUE_BATCH_SIZE);
  const client = useQueryClient();
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
      await refresh();
    },
  });
  const move = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      updateTask(id, revision, { date }),
    onSuccess: refresh,
  });
  const retry = () => {
    void overview.refetch();
  };
  const common = { pending: overview.isPending, error: overview.isError, retry };
  const overdueTasks = overview.data?.overdueTasks ?? [];
  const visibleOverdueTasks = overdueTasks.slice(0, visibleOverdueCount);
  const remainingOverdueTasks = overdueTasks.length - visibleOverdueTasks.length;

  function submit(event: FormEvent) {
    event.preventDefault();
    quickAdd.mutate();
  }

  return (
    <section className="page overview" aria-labelledby="overview-title">
      <header className="page-header page-header--overview">
        <div>
          <p className="eyebrow">今天 · 本机工作台</p>
          <h1 id="overview-title">把今天，安稳地放在眼前。</h1>
          <p className="page-lead">任务、小记与学习进度，来自本机唯一数据源。</p>
        </div>
        <time className="date-card" dateTime={date}>
          <span>
            {new Intl.DateTimeFormat('zh-CN', { month: 'long', timeZone: 'Asia/Shanghai' }).format(
              new Date(),
            )}
          </span>
          <strong>{date.slice(-2)}</strong>
          <small>
            {new Intl.DateTimeFormat('zh-CN', {
              weekday: 'long',
              timeZone: 'Asia/Shanghai',
            }).format(new Date())}
          </small>
        </time>
      </header>

      <form className="quick-add" onSubmit={submit}>
        <label htmlFor="quick-task">快速添加今天的任务</label>
        <div>
          <input
            id="quick-task"
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="现在最值得完成的是什么？"
          />
          <button disabled={quickAdd.isPending}>{quickAdd.isPending ? '添加中…' : '添加'}</button>
        </div>
        {quickAdd.error ? (
          <p role="alert" className="form-error">
            {quickAdd.error.message}
          </p>
        ) : null}
      </form>

      <div className="overview-grid" aria-label="今日总览">
        <Block title="今日焦点" label="任务摘要" primary {...common}>
          {overview.data ? <Summary data={overview.data} /> : null}
        </Block>
        <Block title="过期待办" label="移回今天" {...common}>
          {overview.data?.overdueTasks.length === 0 ? (
            <p className="empty-state">没有逾期任务。</p>
          ) : null}
          <ul className="compact-list">
            {visibleOverdueTasks.map((task) => (
              <li key={task.id}>
                <div>
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
          {move.error ? (
            <p role="alert" className="form-error">
              移动失败，请刷新后重试。
            </p>
          ) : null}
        </Block>
        <Block title="最近小记" label="刚刚记下" {...common}>
          {overview.data?.recentNotes.length === 0 ? (
            <p className="empty-state">还没有小记。</p>
          ) : null}
          <ul className="note-snippets">
            {overview.data?.recentNotes.map((note) => (
              <li key={note.id}>{note.content}</li>
            ))}
          </ul>
          <Link className="text-link" to="/notes">
            查看全部小记
          </Link>
        </Block>
        <Block title="继续学习" label="续接进度" {...common}>
          {overview.data?.nextLearning ? (
            <div className="learning-resume">
              <h3>{overview.data.nextLearning.title}</h3>
              <p>
                {overview.data.nextLearning.resumePartTitle} ·{' '}
                {Math.floor(overview.data.nextLearning.resumeSeconds / 60)} 分钟处
              </p>
              <Link className="text-link" to="/learning">
                打开学习页
              </Link>
            </div>
          ) : (
            <p className="empty-state">还没有可续接的学习进度。</p>
          )}
        </Block>
        <Block title="近 7 天完成" label="轻量回望" {...common}>
          {overview.data?.last7Days.every((day) => day.planned === 0) ? (
            <p className="empty-state">近 7 天还没有计划，不计算完成率。</p>
          ) : null}
          <div className="mini-chart" role="img" aria-label="近 7 天每日任务完成率">
            {overview.data?.last7Days.map((day) => (
              <div key={day.date}>
                <span style={{ height: `${(day.completionRate ?? 0) * 100}%` }} />
                <small>{day.date.slice(5)}</small>
                <b>
                  {day.completionRate === null ? '—' : `${Math.round(day.completionRate * 100)}%`}
                </b>
              </div>
            ))}
          </div>
          <Link className="text-link" to="/review">
            查看完整回顾
          </Link>
        </Block>
      </div>
    </section>
  );
}
