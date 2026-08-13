import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LearningResource, LearningSeries } from '@workbench/shared';
import { useState, type FormEvent } from 'react';

import { isRevisionConflict } from '../../shared/api/client';
import {
  createLearningSeries,
  deleteLearningSeries,
  replaceLearningSeriesItems,
  updateLearningSeries,
} from '../../shared/api/learning';
import { queryKeys } from '../../shared/api/query-keys';

type SeriesAction =
  { readonly kind: 'save-name' } | { readonly kind: 'save-items' } | { readonly kind: 'delete' };

function SeriesEditor({
  series,
  resources,
}: {
  readonly series: LearningSeries;
  readonly resources: readonly LearningResource[];
}) {
  const client = useQueryClient();
  const [name, setName] = useState(series.name);
  const [ids, setIds] = useState([...series.resourceIds]);
  const [toAdd, setToAdd] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.learningSeries });
  const mutation = useMutation({
    mutationFn: async (action: SeriesAction): Promise<void> => {
      if (action.kind === 'save-name') {
        await updateLearningSeries(series.id, { revision: series.revision, name });
        return;
      }
      if (action.kind === 'save-items') {
        await replaceLearningSeriesItems(series.id, {
          revision: series.revision,
          resourceIds: ids,
        });
        return;
      }
      await deleteLearningSeries(series.id, series.revision);
    },
    onSuccess: refresh,
    onError: (error) => {
      if (isRevisionConflict(error)) void refresh();
    },
  });
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const available = resources.filter((resource) => !ids.includes(resource.id));

  function move(index: number, offset: number) {
    setIds((current) => {
      const next = [...current];
      const other = index + offset;
      const value = next[index];
      if (value === undefined || other < 0 || other >= next.length) return current;
      next[index] = next[other]!;
      next[other] = value;
      return next;
    });
  }

  return (
    <li className="series-card">
      <div className="field-row">
        <label>
          系列名称
          <input
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          disabled={mutation.isPending || name.trim() === ''}
          onClick={() => mutation.mutate({ kind: 'save-name' })}
        >
          保存名称
        </button>
      </div>
      <ol className="series-items">
        {ids.map((id, index) => {
          const title = resourceById.get(id)?.title ?? '已移除的资源';
          return (
            <li key={id}>
              <span>{title}</span>
              <div className="series-item-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`上移 ${title}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`下移 ${title}`}
                  disabled={index === ids.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button-danger"
                  aria-label={`从系列移除 ${title}`}
                  onClick={() => setIds((current) => current.filter((item) => item !== id))}
                >
                  移除
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="field-row series-add-row">
        <label>
          添加资源
          <select value={toAdd} onChange={(event) => setToAdd(event.target.value)}>
            <option value="">选择资源</option>
            {available.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button-secondary"
          disabled={toAdd === ''}
          onClick={() => {
            setIds((current) => [...current, toAdd]);
            setToAdd('');
          }}
        >
          加入系列
        </button>
      </div>
      <div className="button-row">
        <button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ kind: 'save-items' })}
        >
          保存顺序
        </button>
        <button
          className="button-danger"
          disabled={mutation.isPending}
          onClick={() =>
            window.confirm('确认删除这个学习系列吗？资源本身不会被删除。') &&
            mutation.mutate({ kind: 'delete' })
          }
        >
          删除系列
        </button>
      </div>
      {mutation.error && (
        <p role="alert" className="form-error">
          {isRevisionConflict(mutation.error)
            ? '系列已在其他页面变化，列表已刷新。'
            : mutation.error.message}
        </p>
      )}
    </li>
  );
}

export function LearningSeriesPanel({
  series,
  resources,
}: {
  readonly series: readonly LearningSeries[];
  readonly resources: readonly LearningResource[];
}) {
  const [name, setName] = useState('');
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () => createLearningSeries(name),
    onSuccess: async () => {
      setName('');
      await client.invalidateQueries({ queryKey: queryKeys.learningSeries });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <section className="series-panel" aria-labelledby="series-title">
      <div>
        <p className="eyebrow">有序学习</p>
        <h2 id="series-title">学习系列</h2>
      </div>
      <form className="field-row" onSubmit={submit}>
        <label>
          新系列名称
          <input
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button disabled={create.isPending || name.trim() === ''}>创建系列</button>
      </form>
      {create.error && (
        <p role="alert" className="form-error">
          {create.error.message}
        </p>
      )}
      {series.length === 0 && <p className="empty-state">还没有学习系列。</p>}
      <ul className="series-list">
        {series.map((item) => (
          <SeriesEditor key={`${item.id}:${item.revision}`} series={item} resources={resources} />
        ))}
      </ul>
    </section>
  );
}
