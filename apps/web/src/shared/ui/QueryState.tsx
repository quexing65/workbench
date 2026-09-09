import type { ReactNode } from 'react';

function classes(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => value !== undefined).join(' ');
}

/**
 * 列表与区块级的加载/失败状态。此前各页面各写一套 markup，类名（`block-error`、
 * `load-error`、裸 div）彼此不一致，其中两套还没有任何样式。统一到这里后，
 * 状态样式只有一处来源，页面只提供文案与重试动作。
 */
export function QueryLoading({
  message = '正在加载…',
  className,
}: {
  readonly message?: string;
  readonly className?: string | undefined;
}) {
  return (
    <p className={classes('query-state', className)} role="status">
      {message}
    </p>
  );
}

export function QueryError({
  message,
  onRetry,
  className,
  children,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}) {
  return (
    <div className={classes('query-state', 'query-state--error', className)} role="alert">
      <p>{message}</p>
      {children}
      <button type="button" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}
