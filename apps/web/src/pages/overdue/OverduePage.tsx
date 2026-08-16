import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessDateSpan, type DailyTask } from '@workbench/shared';

import { isRevisionConflict } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query-keys';
import { getOverdueTasks, updateTask } from '../../shared/api/tasks';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function overdueDays(date: string, today: string): number {
  return businessDateSpan(date, today) - 1;
}

type OverdueAction = 'move' | 'completed' | 'cancelled';

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
    mutationFn: (action: OverdueAction) =>
      action === 'move'
        ? updateTask(task.id, task.revision, { date: today })
        : updateTask(task.id, task.revision, { status: action }),
    onSuccess: refresh,
    onError: refresh,
  });

  return (
    <li className="work-item">
      <div className="work-item__body">
        <span className="status-pill status-pill--active">待完成</span>
        <h3>{task.title}</h3>
        {task.description ? <p>{task.description}</p> : null}
        <small className="overdue-item__meta">
          {task.date} · 逾期 {overdueDays(task.date, today)} 天
        </small>
      </div>
      <div className="button-row">
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
          onClick={() => mutation.mutate('cancelled')}
        >
          取消
        </button>
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
  const overdue = useQuery({
    queryKey: queryKeys.overdueTasks(date),
    queryFn: ({ signal }) => getOverdueTasks(date, signal),
  });
  const groups = new Map<string, DailyTask[]>();
  for (const task of overdue.data?.items ?? []) {
    const existing = groups.get(task.date);
    if (existing === undefined) groups.set(task.date, [task]);
    else existing.push(task);
  }
  const oldestDate = overdue.data?.items.length ? overdue.data.items[0]!.date : null;

  return (
    <section className="page business-page" aria-labelledby="overdue-title">
      <header className="page-header overdue-header">
        <div>
          <p className="eyebrow">清理积压</p>
          <h1 id="overdue-title">逾期</h1>
          <p className="page-lead">
            过去日期里仍未完成的任务都在这里：移回今天、直接完成，或干脆取消。
          </p>
        </div>
        {overdue.data && overdue.data.items.length > 0 ? (
          <p className="overdue-summary">
            共 {overdue.data.items.length} 项 · 最早 {oldestDate}
          </p>
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
      {overdue.data?.items.length === 0 ? (
        <p className="empty-state">没有过期待办，保持得很好。</p>
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
