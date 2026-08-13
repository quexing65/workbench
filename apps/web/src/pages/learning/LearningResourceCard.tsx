import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LearningResource } from '@workbench/shared';
import { useState } from 'react';

import { isRevisionConflict } from '../../shared/api/client';
import {
  completeLearningProgress,
  deleteLearningResource,
  observeLearningProgress,
  resetLearningProgress,
} from '../../shared/api/learning';
import { queryKeys } from '../../shared/api/query-keys';

type Action =
  | { readonly kind: 'observe'; readonly partId: string; readonly seconds: number }
  | { readonly kind: 'complete' | 'reset' | 'delete' };

function durationLabel(value: number): string {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

export function LearningResourceCard({ resource }: { readonly resource: LearningResource }) {
  const client = useQueryClient();
  const [seconds, setSeconds] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      resource.parts.map((part) => [
        part.id,
        String(
          resource.progress.resumePartId === part.id
            ? resource.progress.resumeSeconds
            : (part.progress?.furthestSeconds ?? 0),
        ),
      ]),
    ),
  );
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.learningResources }),
      client.invalidateQueries({ queryKey: queryKeys.learningSeries }),
      client.invalidateQueries({ queryKey: ['overview'] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async (action: Action): Promise<void> => {
      switch (action.kind) {
        case 'observe':
          await observeLearningProgress(resource.id, {
            revision: resource.progress.revision,
            partId: action.partId,
            seconds: action.seconds,
            observedAt: new Date().toISOString(),
            source: 'manual',
          });
          return;
        case 'complete':
          await completeLearningProgress(resource.id, resource.progress.revision);
          return;
        case 'reset':
          await resetLearningProgress(resource.id, resource.progress.revision);
          return;
        case 'delete':
          await deleteLearningResource(resource.id, resource.revision);
      }
    },
    onSuccess: refresh,
    onError: (error) => {
      if (isRevisionConflict(error)) void refresh();
    },
  });

  return (
    <article className="learning-card">
      <header className="learning-card__header">
        <div>
          <span
            className={`status-pill${resource.progress.completed ? ' status-pill--completed' : ''}`}
          >
            {resource.progress.completed ? '已完成' : '学习中'}
          </span>
          <h2>{resource.title}</h2>
          <p>
            {resource.uploaderName ?? '未知 UP 主'} · {resource.parts.length} 个分P ·{' '}
            {durationLabel(resource.durationSeconds)}
          </p>
        </div>
        <a href={resource.sourceUrl} target="_blank" rel="noreferrer">
          在 B站打开<span className="visually-hidden"> {resource.title}</span>
        </a>
      </header>

      {resource.progress.resumePartId !== null && (
        <p className="resume-note">
          上次看到 {durationLabel(resource.progress.resumeSeconds)}，可继续记录新的真实进度。
        </p>
      )}
      <ol className="part-list">
        {resource.parts.map((part) => {
          const value = Number(seconds[part.id] ?? 0);
          return (
            <li key={part.id}>
              <div className="part-copy">
                <strong>
                  P{part.partNumber} · {part.title}
                </strong>
                <small>
                  已到 {durationLabel(part.progress?.furthestSeconds ?? 0)} /{' '}
                  {durationLabel(part.durationSeconds)}
                </small>
                <progress
                  aria-label={`${part.title} 观看进度`}
                  max={Math.max(part.durationSeconds, 1)}
                  value={part.progress?.furthestSeconds ?? 0}
                />
              </div>
              <form
                className="part-progress-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({ kind: 'observe', partId: part.id, seconds: value });
                }}
              >
                <label>
                  <span className="visually-hidden">{part.title} 看到秒数</span>
                  <input
                    aria-label={`${part.title} 看到秒数`}
                    type="number"
                    min={0}
                    max={part.durationSeconds}
                    step={1}
                    required
                    value={seconds[part.id] ?? '0'}
                    onChange={(event) =>
                      setSeconds((current) => ({ ...current, [part.id]: event.target.value }))
                    }
                  />
                </label>
                <button disabled={mutation.isPending || !Number.isInteger(value)}>记录进度</button>
              </form>
            </li>
          );
        })}
      </ol>
      <div className="button-row learning-actions">
        {!resource.progress.completed && (
          <button
            disabled={mutation.isPending}
            onClick={() =>
              window.confirm('确认将整项学习标记为完成吗？') &&
              mutation.mutate({ kind: 'complete' })
            }
          >
            标记整项完成
          </button>
        )}
        <button
          className="button-secondary"
          disabled={mutation.isPending}
          onClick={() =>
            window.confirm('确认清空这项学习的全部进度吗？此操作不能撤销。') &&
            mutation.mutate({ kind: 'reset' })
          }
        >
          重置进度
        </button>
        <button
          className="button-danger"
          disabled={mutation.isPending}
          onClick={() =>
            window.confirm('确认从工作台移除这项学习资源吗？') &&
            mutation.mutate({ kind: 'delete' })
          }
        >
          移除资源
        </button>
      </div>
      {mutation.error && (
        <p role="alert" className="form-error">
          {isRevisionConflict(mutation.error)
            ? '进度已在其他页面变化，列表已刷新。'
            : mutation.error.message}
        </p>
      )}
    </article>
  );
}
