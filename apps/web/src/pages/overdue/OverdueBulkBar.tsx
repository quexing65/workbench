export type BulkAction = 'move' | 'completed' | 'expired' | 'reopen' | 'delete';
export type BulkView = 'active' | 'completed' | 'expired';

const ACTIONS_BY_VIEW: Readonly<
  Record<BulkView, readonly { action: BulkAction; label: string }[]>
> = {
  active: [
    { action: 'move', label: '批量移到今天' },
    { action: 'completed', label: '批量标为完成' },
    { action: 'expired', label: '批量标记过期' },
  ],
  completed: [{ action: 'reopen', label: '批量标为未完成' }],
  expired: [
    { action: 'reopen', label: '批量标为未完成' },
    { action: 'delete', label: '批量删除' },
  ],
};

/**
 * 逾期页批量操作栏：仅在选择了任务且当前筛选状态支持批量时渲染。
 * 逐项请求由页面并发发出（乐观锁按资源生效），此组件只负责动作与确认。
 */
export function OverdueBulkBar({
  view,
  count,
  pending,
  onSelectAll,
  allSelected,
  onClear,
  onAction,
}: {
  readonly view: BulkView;
  readonly count: number;
  readonly pending: boolean;
  readonly allSelected: boolean;
  readonly onSelectAll: () => void;
  readonly onClear: () => void;
  readonly onAction: (action: BulkAction) => void;
}) {
  const actions = ACTIONS_BY_VIEW[view];

  return (
    <div className="overdue-bulk-bar" role="toolbar" aria-label="批量操作">
      <label className="overdue-bulk-bar__all">
        <input type="checkbox" checked={allSelected} onChange={onSelectAll} />
        全选当前筛选
      </label>
      <p className="overdue-bulk-bar__count" role="status">
        已选 {count} 项
      </p>
      <div className="overdue-bulk-bar__actions">
        {actions.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            className={action === 'delete' ? 'button-danger' : 'button-secondary'}
            disabled={pending || count === 0}
            onClick={() => onAction(action)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="button-secondary" disabled={pending} onClick={onClear}>
          清空选择
        </button>
      </div>
    </div>
  );
}
