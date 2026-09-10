import { useEffect, useRef } from 'react';

import { SHORTCUT_GROUPS } from '../../app/shortcuts';

/** 快捷键表：? 浮层与设置页共用，保证两处文案一致。 */
export function ShortcutTable() {
  return (
    <div className="shortcut-table">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <dl>
            {group.items.map((item) => (
              <div className="shortcut-table__row" key={item.keys}>
                <dt>
                  {item.keys.split(' ').map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // 浮层打开时全局快捷键让位（其 dialog 守卫），? 的"再按一次关闭"由此处接管。
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <h2 id="shortcut-sheet-title">键盘快捷键</h2>
          <button ref={closeButton} type="button" className="button-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
        <ShortcutTable />
        <p className="sheet__hint">输入框内与确认弹窗打开时不会触发快捷键。</p>
      </div>
    </div>
  );
}
