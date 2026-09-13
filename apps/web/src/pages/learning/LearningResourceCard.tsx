import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { LearningResource } from '@workbench/shared';

import { errorMessage, isRevisionConflict } from '../../shared/api/client';
import {
  completeLearningProgress,
  deleteLearningResource,
  renameLearningResource,
  resetLearningProgress,
} from '../../shared/api/learning';
import { queryKeys } from '../../shared/api/query-keys';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { useToast } from '../../shared/ui/Toast';
import { LearningResourceSync } from './LearningResourceSync';

type Action =
  | { readonly kind: 'rename'; readonly customTitle: string | null }
  | { readonly kind: 'complete' | 'reset' | 'delete' };

const TOAST_BY_ACTION: Record<Action['kind'], string> = {
  rename: '已更新标题',
  complete: '已标记整项完成',
  reset: '已重置进度',
  delete: '已移除资源',
};

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

// 原生 title 悬浮提示只在文本真正被截断时挂上，放得下的标题不弹框。
function useOverflowTooltip<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const sync = () => {
      if (element.scrollWidth > element.clientWidth + 1) element.setAttribute('title', text);
      else element.removeAttribute('title');
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  return ref;
}

export function LearningResourceCard({ resource }: { readonly resource: LearningResource }) {
  const client = useQueryClient();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
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
        case 'rename':
          await renameLearningResource(resource.id, {
            revision: resource.revision,
            customTitle: action.customTitle,
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
    onSuccess: async (_data, action) => {
      toast.push(TOAST_BY_ACTION[action.kind]);
      await refresh();
    },
    onError: (error) => {
      if (isRevisionConflict(error)) void refresh();
    },
  });
  const { confirm, dialog } = useConfirm();
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
  const displayTitle = resource.customTitle ?? resource.title;
  const currentHeading = currentPart
    ? `当前观看：P${currentPart.partNumber} · ${currentPart.title}`
    : '';
  const titleRef = useOverflowTooltip<HTMLHeadingElement>(displayTitle);
  const headingRef = useOverflowTooltip<HTMLDivElement>(currentHeading);

  function startRename() {
    setDraftTitle(displayTitle);
    setRenaming(true);
  }

  function submitRename() {
    const trimmed = draftTitle.trim();
    if (trimmed === '') return;
    mutation.mutate({ kind: 'rename', customTitle: trimmed });
    setRenaming(false);
  }

  return (
    <article className="learning-card">
      <header className="learning-card__header">
        <div>
          <div className="learning-card__meta-row">
            <span
              className={`status-pill${resource.progress.completed ? ' status-pill--completed' : ''}`}
            >
              {resource.progress.completed ? '已完成' : '学习中'}
            </span>
            <p className="learning-card__meta">
              {resource.uploaderName ?? '未知 UP 主'} · {resource.parts.length} 个分P ·{' '}
              {durationLabel(resource.durationSeconds)}
            </p>
          </div>
          {renaming ? (
            <form
              className="learning-card__rename-form"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRenaming(false);
              }}
              onSubmit={(event) => {
                event.preventDefault();
                submitRename();
              }}
            >
              <input
                autoFocus
                aria-label="自定义标题"
                maxLength={500}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
              />
              <button disabled={mutation.isPending}>保存</button>
              <button
                type="button"
                className="button-secondary"
                disabled={mutation.isPending}
                onClick={() => setRenaming(false)}
              >
                取消
              </button>
              {resource.customTitle !== null && (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={mutation.isPending}
                  onClick={() => {
                    mutation.mutate({ kind: 'rename', customTitle: null });
                    setRenaming(false);
                  }}
                >
                  恢复原标题
                </button>
              )}
            </form>
          ) : (
            <div className="learning-card__title-row">
              <h2 ref={titleRef}>{displayTitle}</h2>
              <button
                type="button"
                className="learning-card__rename"
                aria-label={`重命名 ${displayTitle}`}
                onClick={startRename}
              >
                重命名
              </button>
            </div>
          )}
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
            <strong ref={headingRef}>{currentHeading}</strong>
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
        </div>
      ) : null}
      <div className="button-row learning-actions">
        <LearningResourceSync resourceId={resource.id} resourceTitle={resource.title} />
        {!resource.progress.completed && (
          <button
            className="learning-action-button learning-action-button--primary"
            disabled={mutation.isPending}
            onClick={() =>
              confirm({
                message: '确认将整项学习标记为完成吗？',
                confirmLabel: '标记完成',
                onConfirm: () => mutation.mutate({ kind: 'complete' }),
              })
            }
          >
            标记整项完成
          </button>
        )}
        <button
          className="button-secondary learning-action-button"
          disabled={mutation.isPending}
          onClick={() =>
            confirm({
              message: '确认清空这项学习的全部进度吗？此操作不能撤销。',
              confirmLabel: '重置进度',
              onConfirm: () => mutation.mutate({ kind: 'reset' }),
            })
          }
        >
          重置进度
        </button>
        <button
          className="button-danger learning-action-button learning-action-button--danger"
          disabled={mutation.isPending}
          onClick={() =>
            confirm({
              message: '确认从工作台移除这项学习资源吗？',
              confirmLabel: '移除资源',
              onConfirm: () => mutation.mutate({ kind: 'delete' }),
            })
          }
        >
          移除资源
        </button>
      </div>
      {mutation.error && (
        <p role="alert" className="form-error">
          {errorMessage(mutation.error, '进度已在其他页面变化，列表已刷新。')}
        </p>
      )}
      {dialog}
    </article>
  );
}
