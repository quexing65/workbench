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
import { LearningResourceSync } from './LearningResourceSync';

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

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
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
  const currentPart =
    resource.parts.find((part) => part.id === resource.progress.resumePartId) ?? resource.parts[0];
  const furthestPartIndex = resource.parts.findIndex(
    (part) => part.id === resource.progress.furthestPartId,
  );
  const watchedBeforeFurthest = resource.parts
    .slice(0, Math.max(furthestPartIndex, 0))
    .reduce((sum, part) => sum + part.durationSeconds, 0);
  const overallWatchedSeconds = resource.progress.completed
    ? resource.durationSeconds
    : watchedBeforeFurthest + resource.progress.furthestSeconds;
  const overallPercent = percent(overallWatchedSeconds, resource.durationSeconds);
  const canResume = overallWatchedSeconds > 0 && !resource.progress.completed;
  const currentSeconds = currentPart
    ? resource.progress.resumePartId === currentPart.id
      ? resource.progress.resumeSeconds
      : (currentPart.progress?.furthestSeconds ?? 0)
    : 0;
  const currentPercent = currentPart ? percent(currentSeconds, currentPart.durationSeconds) : 0;
  const resumeUrl = currentPart
    ? `${resource.sourceUrl.replace(/[?#].*$/u, '')}?p=${currentPart.partNumber}${currentSeconds > 5 ? `&t=${currentSeconds}` : ''}`
    : resource.sourceUrl;

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
        <a
          href={resumeUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${canResume ? '继续观看' : '在 B站打开'} ${resource.title}`}
        >
          {canResume ? '继续观看' : '在 B站打开'}
        </a>
      </header>

      {currentPart ? (
        <div className="current-part" aria-label="当前观看进度">
          <div className="current-part__heading">
            <strong>
              当前观看：P{currentPart.partNumber} · {currentPart.title}
            </strong>
            <span>
              {durationLabel(currentSeconds)} / {durationLabel(currentPart.durationSeconds)}（
              {currentPercent}%）
            </span>
          </div>
          <progress
            aria-label="本集观看进度"
            max={Math.max(currentPart.durationSeconds, 1)}
            value={currentSeconds}
          />
          <div className="overall-progress-copy">
            <span>合集总进度</span>
            <span>
              {durationLabel(overallWatchedSeconds)} / {durationLabel(resource.durationSeconds)}（
              {overallPercent}%）
            </span>
          </div>
          <progress
            aria-label="合集总进度"
            max={Math.max(resource.durationSeconds, 1)}
            value={overallWatchedSeconds}
          />
          {(() => {
            const value = Number(seconds[currentPart.id] ?? 0);
            return (
              <div className="part-copy">
                <form
                  className="part-progress-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({ kind: 'observe', partId: currentPart.id, seconds: value });
                  }}
                >
                  <label>
                    本集看到秒数
                    <input
                      aria-label={`${currentPart.title} 看到秒数`}
                      type="number"
                      min={0}
                      max={currentPart.durationSeconds}
                      step={1}
                      required
                      value={seconds[currentPart.id] ?? '0'}
                      onChange={(event) =>
                        setSeconds((current) => ({
                          ...current,
                          [currentPart.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button disabled={mutation.isPending || !Number.isInteger(value)}>
                    记录进度
                  </button>
                </form>
              </div>
            );
          })()}
        </div>
      ) : null}
      <div className="button-row learning-actions">
        <LearningResourceSync resourceId={resource.id} resourceTitle={resource.title} />
        {!resource.progress.completed && (
          <button
            className="learning-action-button learning-action-button--primary"
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
          className="button-secondary learning-action-button"
          disabled={mutation.isPending}
          onClick={() =>
            window.confirm('确认清空这项学习的全部进度吗？此操作不能撤销。') &&
            mutation.mutate({ kind: 'reset' })
          }
        >
          重置进度
        </button>
        <button
          className="button-danger learning-action-button learning-action-button--danger"
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
