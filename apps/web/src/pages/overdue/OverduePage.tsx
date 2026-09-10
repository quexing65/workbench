import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { businessDateSpan, type DailyTask } from '@workbench/shared';

import { errorMessage } from '../../shared/api/client';
import { businessToday } from '../../shared/api/business-time';
import { queryKeys } from '../../shared/api/query-keys';
import { deleteTask, getOverdueTasks, updateTask } from '../../shared/api/tasks';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { QueryError, QueryLoading } from '../../shared/ui/QueryState';
import { useToast } from '../../shared/ui/Toast';
import { OverdueBulkBar, type BulkAction } from './OverdueBulkBar';

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

const TOAST_BY_ACTION: Record<OverdueAction, string> = {
  move: '已移到今天',
  completed: '已标为完成',
  expired: '已标记过期',
  reopen: '已标为未完成',
  delete: '已删除任务',
};

function OverdueItem({
  task,
  today,
  selectable,
  selected,
  onToggleSelected,
}: {
  task: DailyTask;
  today: string;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const client = useQueryClient();
  const toast = useToast();
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
    onSuccess: async (_data, action) => {
      toast.push(TOAST_BY_ACTION[action]);
      await refresh();
    },
    onError: refresh,
  });
  const { confirm, dialog } = useConfirm();

  const pill = STATUS_PILLS[task.status];

  return (
    <li className={`work-item work-item--${task.status} task-card`}>
      <div className="task-card__content">
        <div className="task-card__head">
          {selectable ? (
            <label className="overdue-item__select">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                aria-label={`选择任务 ${task.title}`}
              />
            </label>
          ) : null}
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
                  confirm({
                    message: '确定删除这条已过期的任务吗？',
                    confirmLabel: '删除',
                    onConfirm: () => mutation.mutate('delete'),
                  })
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
          {errorMessage(mutation.error, '数据已在其他页面修改，已刷新当前列表。')}
        </p>
      ) : null}
      {dialog}
    </li>
  );
}

export function OverduePage() {
  const date = businessToday();
  const [view, setView] = useState<StatusView>('active');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const client = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const overdue = useQuery({
    queryKey: queryKeys.overdueTasks(date),
    queryFn: ({ signal }) => getOverdueTasks(date, 'all', signal),
  });

  const all = overdue.data?.items ?? [];
  const activeCount = all.filter((task) => task.status === 'active').length;
  const completedCount = all.filter((task) => task.status === 'completed').length;
  const expiredCount = all.filter((task) => task.status === 'expired').length;
  const visible = view === 'all' ? all : all.filter((task) => task.status === view);
  const bulkView = view === 'all' ? null : view;

  const groups = new Map<string, DailyTask[]>();
  for (const task of visible) {
    const existing = groups.get(task.date);
    if (existing === undefined) groups.set(task.date, [task]);
    else existing.push(task);
  }

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.overdueTasks(date) }),
      client.invalidateQueries({ queryKey: queryKeys.overview(date) }),
    ]);
  };

  function changeView(next: StatusView) {
    setView(next);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((current) => {
      if (visible.every((task) => current.has(task.id))) return new Set<string>();
      return new Set(visible.map((task) => task.id));
    });
  }

  const bulk = useMutation({
    mutationFn: async (action: BulkAction) => {
      const targets = visible.filter((task) => selected.has(task.id));
      const results = await Promise.allSettled(
        targets.map((task) => {
          if (action === 'delete') return deleteTask(task.id, task.revision);
          if (action === 'move') return updateTask(task.id, task.revision, { date });
          return updateTask(task.id, task.revision, {
            status: action === 'reopen' ? 'active' : action,
          });
        }),
      );
      return {
        total: results.length,
        ok: results.filter((item) => item.status === 'fulfilled').length,
      };
    },
    onSuccess: async (result) => {
      setSelected(new Set());
      if (result.total === 0) return;
      if (result.ok === result.total) {
        toast.push(`已处理 ${result.ok} 项`);
      } else {
        toast.push(`已处理 ${result.ok} 项，${result.total - result.ok} 项未成功，列表已刷新`);
      }
      await refresh();
    },
    onError: async () => {
      setSelected(new Set());
      toast.push('批量操作失败，列表已刷新');
      await refresh();
    },
  });

  const allSelected = visible.length > 0 && visible.every((task) => selected.has(task.id));

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
                  onClick={() => changeView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>
      {overdue.isPending ? <QueryLoading message="正在整理过期待办…" /> : null}
      {overdue.isError ? (
        <QueryError message="过期待办加载失败。" onRetry={() => overdue.refetch()} />
      ) : null}
      {overdue.data !== undefined && all.length === 0 ? (
        <p className="empty-state">没有过期待办，保持得很好。</p>
      ) : null}
      {overdue.data !== undefined && all.length > 0 && visible.length === 0 ? (
        <p className="empty-state">当前筛选下没有任务。</p>
      ) : null}
      {overdue.data !== undefined && bulkView !== null && visible.length > 0 ? (
        <OverdueBulkBar
          view={bulkView}
          count={selected.size}
          pending={bulk.isPending}
          allSelected={allSelected}
          onSelectAll={toggleSelectAll}
          onClear={() => setSelected(new Set())}
          onAction={(action) => {
            if (action === 'delete') {
              confirm({
                message: `确定批量删除选中的 ${selected.size} 项已过期任务吗？`,
                confirmLabel: '删除',
                onConfirm: () => bulk.mutate('delete'),
              });
            } else {
              bulk.mutate(action);
            }
          }}
        />
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
              <OverdueItem
                key={task.id}
                task={task}
                today={date}
                selectable={bulkView !== null}
                selected={selected.has(task.id)}
                onToggleSelected={() => toggleSelected(task.id)}
              />
            ))}
          </ul>
        </section>
      ))}
      {dialog}
    </section>
  );
}
