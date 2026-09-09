import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmRequest {
  readonly message: string;
  readonly confirmLabel?: string | undefined;
  readonly onConfirm: () => void;
}

/**
 * 应用内确认对话框，替代 `window.confirm`：原生弹窗无法定制文案与按钮，且在
 * Electron 里是阻塞式模态。这里提供 `role="alertdialog"`、Esc 取消、初始焦点与
 * Tab 焦点循环，保证键盘可达。
 */
export function ConfirmDialog({
  request,
  onCancel,
}: {
  readonly request: ConfirmRequest | null;
  readonly onCancel: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request === null) return;
    confirmButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = container.current?.querySelectorAll<HTMLElement>('button');
      if (focusable === undefined || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [request, onCancel]);

  if (request === null) return null;

  return (
    <div className="confirm-backdrop">
      <div
        ref={container}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-message"
      >
        <p id="confirm-dialog-message">{request.message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            ref={confirmButton}
            onClick={() => {
              request.onConfirm();
              onCancel();
            }}
          >
            {request.confirmLabel ?? '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 页面级用法：`const { confirm, dialog } = useConfirm()`，在 JSX 中渲染 `dialog`。 */
export function useConfirm(): {
  readonly confirm: (request: ConfirmRequest) => void;
  readonly dialog: ReactNode;
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const cancel = useCallback(() => setRequest(null), []);
  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);
  return { confirm, dialog: <ConfirmDialog request={request} onCancel={cancel} /> };
}
