import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { businessDateSpan, type DailyTask } from '@workbench/shared';

import { isRevisionConflict } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query-keys';
import { deleteTask, getOverdueTasks, updateTask } from '../../shared/api/tasks';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function overdueDays(date: string, today: string): number {
  return businessDateSpan(date, today) - 1;
}

type OverdueAction = 'move' | 'completed' | 'expired' | 'reopen' | 'delete';

type StatusView = 'active' | 'completed' | 'expired' | 'all';

const STATUS_VIEWS: ReadonlyArray<{ value: StatusView; label: string }> = [
  { value: 'active', label: '未完成' },
  { value: 'completed', label: '已完成' },
  { value: 'expired', label: '已过期' },
  { value: 'all', label: '全部' },
];

const STATUS_PILLS: Readonly<Record<DailyTask['status'], { label: string; className: string }>> = {
  active: { label: '未完成', className: 'status-pill--active' },
  completed: { label: '已完成', className: 'status-pill--completed' },
  cancelled: { label: '已取消', className: 'status-pill--cancelled' },
  expired: { label: '已过期', className: 'status-pill--expired' },
};

function OverdueItem({ task, today }: { task: DailyTask; today: string }) {
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.overdueTasks(today) }),
      client.invalidateQueries({ queryKey: queryKeys.tasks(task.date) }),
      client.invalidateQueries({ queryKey: queryKeys.tasks(today) }),
      client.invalidateQueries({ queryKey: queryKeys.overview(today) }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async (action: OverdueAction): Promise<unknown> => {
      if (action === 'move') return updateTask(task.id, task.revision, { date: today });
      if (action === 'reopen') return updateTask(task.id, task.revision, { status: 'active' });
      if (action === 'delete') return deleteTask(task.id, task.revision);
      return updateTask(task.id, task.revision, { status: action });
    },
    onSuccess: refresh,
    onError: refresh,
  });

  const pill = STATUS_PILLS[task.status];

  return (
    <li className={`work-item work-item--${task.status} task-card`}>
      <div className="task-card__content">
        <div className="task-card__head">
          <span className={`status-pill ${pill.className}`}>{pill.label}</span>
          <h3>{task.title}</h3>
          <span className="task-card__tag">
            {task.date} · 逾期 {overdueDays(task.date, today)} 天
          </span>
        </div>
        {task.description ? <p className="task-card__desc">{task.description}</p> : null}
      </div>
      <div className="button-row task-card__actions">
        {task.status === 'active' ? (
          <>
            <button disabled={mutation.isPending} onClick={() => mutation.mutate('move')}>
              移到今天
            </button>
            <button
              className="button-secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('completed')}
            >
              完成
            </button>
            <button
              className="button-secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('expired')}
            >
              过期
            </button>
          </>
        ) : (
          <>
            <button disabled={mutation.isPending} onClick={() => mutation.mutate('reopen')}>
              标为未完成
            </button>
            {task.status === 'expired' && (
              <button
                className="button-danger"
                disabled={mutation.isPending}
                onClick={() =>
                  window.confirm('确定删除这条已过期的任务吗？') && mutation.mutate('delete')
                }
              >
                删除
              </button>
            )}
          </>
        )}
      </div>
      {mutation.error ? (
        <p role="alert" className="form-error">
          {isRevisionConflict(mutation.error)
            ? '数据已在其他页面修改，已刷新当前列表。'
            : mutation.error.message}
        </p>
      ) : null}
    </li>
  );
}

export function OverduePage() {
  const date = today();
  const [view, setView] = useState<StatusView>('active');
  const overdue = useQuery({
    queryKey: queryKeys.overdueTasks(date),
    queryFn: ({ signal }) => getOverdueTasks(date, 'all', signal),
  });

  const all = overdue.data?.items ?? [];
  const activeCount = all.filter((task) => task.status === 'active').length;
  const completedCount = all.filter((task) => task.status === 'completed').length;
  const expiredCount = all.filter((task) => task.status === 'expired').length;
  const visible = view === 'all' ? all : all.filter((task) => task.status === view);

  const groups = new Map<string, DailyTask[]>();
  for (const task of visible) {
    const existing = groups.get(task.date);
    if (existing === undefined) groups.set(task.date, [task]);
    else existing.push(task);
  }

  return (
    <section className="page business-page" aria-labelledby="overdue-title">
      <header className="page-header overdue-header">
        <div>
          <p className="eyebrow">清理积压</p>
          <h1 id="overdue-title">逾期</h1>
          <p className="page-lead">
            过去日期里的任务都在这里：移回今天、直接完成，或干脆取消；误标完成的可以改回未完成。
          </p>
        </div>
        {all.length > 0 ? (
          <div className="overdue-header__meta">
            <p className="overdue-summary">
              共 {all.length} 项 · 未完成 {activeCount} · 已完成 {completedCount} · 已过期{' '}
              {expiredCount}
            </p>
            <div className="filter-chip-row" role="group" aria-label="按完成状态筛选">
              {STATUS_VIEWS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className="filter-chip"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>
      {overdue.isPending ? (
        <p role="status" className="review-state">
          正在整理过期待办…
        </p>
      ) : null}
      {overdue.isError ? (
        <div role="alert" className="review-state">
          <p>过期待办加载失败。</p>
          <button onClick={() => overdue.refetch()}>重试</button>
        </div>
      ) : null}
      {overdue.data !== undefined && all.length === 0 ? (
        <p className="empty-state">没有过期待办，保持得很好。</p>
      ) : null}
      {overdue.data !== undefined && all.length > 0 && visible.length === 0 ? (
        <p className="empty-state">当前筛选下没有任务。</p>
      ) : null}
      {[...groups.entries()].map(([groupDate, items]) => (
        <section className="overdue-group" key={groupDate} aria-labelledby={`overdue-${groupDate}`}>
          <h2 id={`overdue-${groupDate}`}>
            {groupDate}
            <small>
              {items.length} 项 · 逾期 {overdueDays(groupDate, date)} 天
            </small>
          </h2>
          <ul className="work-list">
            {items.map((task) => (
              <OverdueItem key={task.id} task={task} today={date} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
