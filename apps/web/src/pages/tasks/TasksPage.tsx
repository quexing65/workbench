import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskListItem, TaskStatus } from '@workbench/shared';
import { useState, type FormEvent } from 'react';

import { isRevisionConflict } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query-keys';
import {
  createTask,
  deleteTask,
  getTasks,
  updateOccurrence,
  updateTask,
} from '../../shared/api/tasks';
import { useAnimatedList } from '../../shared/ui/useAnimatedList';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  active: '待完成',
  completed: '已完成',
  expired: '已过期',
  cancelled: '已取消',
};

function TaskRow({ item, date }: { item: TaskListItem; date: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [taskDate, setTaskDate] = useState(item.date);
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.tasks(date) });
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'delete' | TaskStatus) => {
      if (item.kind === 'recurring') {
        if (action !== 'save' && action !== 'delete') {
          if (action === 'expired') throw new Error('固定任务不支持过期状态');
          await updateOccurrence(item.templateId, item.date, item.revision, action);
        }
      } else if (action === 'delete') await deleteTask(item.id, item.revision);
      else if (action === 'save')
        await updateTask(item.id, item.revision, { title, description, date: taskDate });
      else await updateTask(item.id, item.revision, { status: action });
    },
    onSuccess: async (_data, action) => {
      if (action === 'save') setEditing(false);
      await refresh();
      if (taskDate !== date)
        await client.invalidateQueries({ queryKey: queryKeys.tasks(taskDate) });
    },
    onError: refresh,
  });

  return (
    <li className={`work-item work-item--${item.status} task-card`}>
      {editing && item.kind === 'daily' ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate('save');
          }}
        >
          <label>
            标题
            <input
              required
              maxLength={500}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            描述
            <textarea
              maxLength={20_000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            日期
            <input
              required
              type="date"
              value={taskDate}
              onChange={(event) => setTaskDate(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button disabled={mutation.isPending}>保存</button>
            <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
              取消编辑
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="task-card__content">
            <div className="task-card__head">
              <span className={`status-pill status-pill--${item.status}`}>
                {STATUS_LABELS[item.status]}
              </span>
              <h2>{item.title}</h2>
              {item.kind === 'recurring' && (
                <span className="task-card__tag" title="当天状态独立，不影响其他日期">
                  固定任务
                </span>
              )}
            </div>
            {item.description && <p className="task-card__desc">{item.description}</p>}
          </div>
          <div className="button-row task-card__actions">
            {item.status !== 'completed' && (
              <button disabled={mutation.isPending} onClick={() => mutation.mutate('completed')}>
                完成
              </button>
            )}
            {(item.status === 'active' || item.status === 'completed') && (
              <button
                className="button-secondary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('cancelled')}
              >
                取消
              </button>
            )}
            {item.status !== 'active' && (
              <button
                className="button-secondary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('active')}
              >
                恢复
              </button>
            )}
            {item.kind === 'daily' && (
              <button className="button-secondary" onClick={() => setEditing(true)}>
                编辑
              </button>
            )}
            {item.kind === 'daily' && (
              <button
                className="button-danger"
                disabled={mutation.isPending}
                onClick={() => window.confirm('确定删除这条任务吗？') && mutation.mutate('delete')}
              >
                删除
              </button>
            )}
          </div>
        </>
      )}
      {mutation.error && (
        <p role="alert" className="form-error">
          {isRevisionConflict(mutation.error)
            ? '数据已在其他页面修改，已刷新当前列表。'
            : mutation.error.message}
        </p>
      )}
    </li>
  );
}

export function TasksPage() {
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const workList = useAnimatedList<HTMLUListElement>();
  const client = useQueryClient();
  const tasks = useQuery({
    queryKey: queryKeys.tasks(date),
    queryFn: ({ signal }) => getTasks(date, signal),
    // 切换日期即切换缓存键：保留上一份数据，避免清单闪空与双节点。
    placeholderData: keepPreviousData,
  });
  const create = useMutation({
    mutationFn: () => createTask({ title, description, date }),
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      await client.invalidateQueries({ queryKey: queryKeys.tasks(date) });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  const items = tasks.data?.items ?? [];
  const doneCount = items.filter((item) => item.status === 'completed').length;

  return (
    <section className="page business-page tasks-page">
      <header className="page-header">
        <p className="eyebrow">每日安排</p>
        <h1>任务</h1>
        <p className="page-lead">把每天的任务与固定任务放在一张清单里。</p>
      </header>
      <div className="business-layout business-layout--wide-editor">
        <form className="editor-card" onSubmit={submit}>
          <h2>新增任务</h2>
          <label>
            标题
            <input
              required
              maxLength={500}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            描述
            <textarea
              maxLength={20_000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            日期
            <input
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button disabled={create.isPending}>{create.isPending ? '保存中…' : '添加任务'}</button>
          {create.error && (
            <p role="alert" className="form-error">
              {create.error.message}
            </p>
          )}
        </form>
        <div className="list-panel">
          <div className="list-toolbar">
            <div className="list-toolbar__title">
              <h2>{date} 的清单</h2>
              {items.length > 0 && (
                <p className="list-toolbar__meta">
                  {items.length - doneCount} 项进行中 · {doneCount} 项已完成
                </p>
              )}
            </div>
            <label>
              切换日期
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
          {tasks.isPending && <p>正在加载任务…</p>}
          {tasks.isError && (
            <div role="alert">
              <p>任务加载失败。</p>
              <button onClick={() => tasks.refetch()}>重试</button>
            </div>
          )}
          {tasks.data?.items.length === 0 && <p className="empty-state">今天还没有任务。</p>}
          <ul className="work-list" ref={workList}>
            {tasks.data?.items.map((item) => (
              <TaskRow key={item.id} item={item} date={date} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
