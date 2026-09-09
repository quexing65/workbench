import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecurringTask } from '@workbench/shared';
import { useState, type FormEvent } from 'react';

import { errorMessage } from '../../shared/api/client';
import { businessToday } from '../../shared/api/business-time';
import { queryKeys } from '../../shared/api/query-keys';
import {
  createRecurringTask,
  deleteRecurringTask,
  getRecurringTasks,
  updateRecurringTask,
} from '../../shared/api/recurring';
import { useAnimatedList } from '../../shared/ui/useAnimatedList';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { QueryError, QueryLoading } from '../../shared/ui/QueryState';

function RecurringRow({ item }: { item: RecurringTask }) {
  const client = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [startDate, setStartDate] = useState(item.startDate);
  const [endDate, setEndDate] = useState(item.endDate ?? '');
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'delete' | 'stop') => {
      if (action === 'delete') await deleteRecurringTask(item.id, item.revision);
      else
        await updateRecurringTask(item.id, item.revision, {
          title,
          startDate,
          endDate:
            action === 'stop'
              ? businessToday() < startDate
                ? startDate
                : businessToday()
              : endDate || null,
        });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.recurringTasks }),
    onError: () => client.invalidateQueries({ queryKey: queryKeys.recurringTasks }),
  });
  const { confirm, dialog } = useConfirm();

  return (
    <li className="work-item">
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
        <div className="field-row">
          <label>
            开始
            <input
              required
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            结束
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <div className="button-row">
          <button disabled={mutation.isPending}>保存</button>
          <button
            type="button"
            className="button-secondary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('stop')}
          >
            今天停止
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={mutation.isPending}
            onClick={() =>
              confirm({
                message: '确定删除这条固定任务吗？',
                confirmLabel: '删除',
                onConfirm: () => mutation.mutate('delete'),
              })
            }
          >
            删除
          </button>
        </div>
      </form>
      {mutation.error && (
        <p role="alert" className="form-error">
          {errorMessage(mutation.error, '数据已在其他页面修改，已刷新。')}
        </p>
      )}
      {dialog}
    </li>
  );
}

export function RecurringPage() {
  const client = useQueryClient();
  const workList = useAnimatedList<HTMLUListElement>();
  const list = useQuery({
    queryKey: queryKeys.recurringTasks,
    queryFn: ({ signal }) => getRecurringTasks(signal),
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(businessToday);
  const [endDate, setEndDate] = useState('');
  const create = useMutation({
    mutationFn: () =>
      createRecurringTask({ title, description, startDate, endDate: endDate || null }),
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      await client.invalidateQueries({ queryKey: queryKeys.recurringTasks });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <section className="page business-page">
      <header className="page-header">
        <p className="eyebrow">每日重复</p>
        <h1>固定任务</h1>
        <p className="page-lead">只保存规则；某天改变状态时，才记录那一天。</p>
      </header>
      <div className="business-layout business-layout--wide-editor">
        <form className="editor-card" onSubmit={submit}>
          <h2>新建固定任务</h2>
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
          <div className="field-row">
            <label>
              开始
              <input
                required
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              结束（可选）
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          <button disabled={create.isPending}>创建</button>
          {create.error && (
            <p role="alert" className="form-error">
              {create.error.message}
            </p>
          )}
        </form>
        <div className="list-panel">
          <h2>生效规则</h2>
          {list.isPending && <QueryLoading />}
          {list.isError && (
            <QueryError message="固定任务加载失败。" onRetry={() => list.refetch()} />
          )}
          {list.data?.items.length === 0 && <p className="empty-state">还没有固定任务。</p>}
          <ul className="work-list" ref={workList}>
            {list.data?.items.map((item) => (
              <RecurringRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
