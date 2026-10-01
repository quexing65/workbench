import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { setThemeMode, useThemeMode, type ThemeMode } from '../../app/preferences';
import { getHealth } from '../api/health';
import { queryKeys } from '../api/query-keys';

const THEME_OPTIONS: ReadonlyArray<{ readonly value: ThemeMode; readonly label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

/** 设置弹窗：侧栏底部按钮唤起，承载主题与关于信息；快捷键说明由 ? 速查表独占。 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const themeMode = useThemeMode();
  const closeButton = useRef<HTMLButtonElement>(null);
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
  });

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
        className="sheet settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <h2 id="settings-dialog-title">设置</h2>
          <button ref={closeButton} type="button" className="button-secondary" onClick={onClose}>
            关闭
          </button>
        </div>

        <section className="settings-dialog__section" aria-labelledby="settings-theme-title">
          <h3 id="settings-theme-title">主题</h3>
          <p className="settings-dialog__note">
            深色模式适合夜间阅读；「跟随系统」按本机深浅色偏好自动切换，也可随时按 D 切换。
          </p>
          <div className="setting-choice" role="radiogroup" aria-label="主题模式">
            {THEME_OPTIONS.map((option) => (
              <label className="setting-choice__option" key={option.value}>
                <input
                  type="radio"
                  name="theme-mode"
                  value={option.value}
                  checked={themeMode === option.value}
                  onChange={() => setThemeMode(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </section>

        <section className="settings-dialog__section" aria-labelledby="settings-about-title">
          <h3 id="settings-about-title">关于</h3>
          <p className="settings-dialog__note">
            业务数据仅保存在这台设备的 SQLite 数据库中，凭据由 Windows DPAPI 独立加密。
          </p>
          <dl className="setting-about">
            <div>
              <dt>应用版本</dt>
              <dd>{health.data !== undefined ? `v${health.data.version}` : '尚未确认'}</dd>
            </div>
            <div>
              <dt>服务状态</dt>
              <dd>
                {health.isError
                  ? '本机服务未连接'
                  : health.isPending
                    ? '正在检查…'
                    : '本机服务正常'}
              </dd>
            </div>
            <div>
              <dt>备份与恢复</dt>
              <dd>
                <Link className="text-link" to="/data" onClick={onClose}>
                  打开「数据」页
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
