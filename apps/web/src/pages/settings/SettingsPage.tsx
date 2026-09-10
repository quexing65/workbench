import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { setThemeMode, useThemeMode, type ThemeMode } from '../../app/preferences';
import { getHealth } from '../../shared/api/health';
import { queryKeys } from '../../shared/api/query-keys';
import { ShortcutTable } from '../../shared/ui/ShortcutSheet';

const THEME_OPTIONS: ReadonlyArray<{ readonly value: ThemeMode; readonly label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

export function SettingsPage() {
  const themeMode = useThemeMode();
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
  });

  function choose(value: ThemeMode) {
    setThemeMode(value);
  }

  return (
    <section className="page business-page settings-page" aria-labelledby="settings-title">
      <header className="page-header">
        <p className="eyebrow">本机偏好</p>
        <h1 id="settings-title">设置</h1>
        <p className="page-lead">外观与快捷键偏好保存在这台设备上，不进入业务数据库。</p>
      </header>

      <section className="editor-card setting-card" aria-labelledby="theme-title">
        <div>
          <p className="eyebrow">外观</p>
          <h2 id="theme-title">主题</h2>
        </div>
        <p className="setting-card__note">
          深色模式适合夜间阅读；「跟随系统」会按本机深浅色偏好自动切换。
        </p>
        <div className="setting-choice" role="radiogroup" aria-label="主题模式">
          {THEME_OPTIONS.map((option) => (
            <label className="setting-choice__option" key={option.value}>
              <input
                type="radio"
                name="theme-mode"
                value={option.value}
                checked={themeMode === option.value}
                onChange={() => choose(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section className="editor-card setting-card" aria-labelledby="shortcuts-title">
        <div>
          <p className="eyebrow">效率</p>
          <h2 id="shortcuts-title">快捷键</h2>
        </div>
        <p className="setting-card__note">随时按 ? 可以唤起这份速查表。</p>
        <ShortcutTable />
      </section>

      <section className="editor-card setting-card" aria-labelledby="about-title">
        <div>
          <p className="eyebrow">关于</p>
          <h2 id="about-title">本机应用</h2>
        </div>
        <p className="setting-card__note">
          业务数据仅保存在这台设备的 SQLite 数据库中，凭据由 Windows DPAPI 独立加密，
          均不随本设置页的偏好写入数据库。
        </p>
        <dl className="setting-about">
          <div>
            <dt>应用版本</dt>
            <dd>{health.data !== undefined ? `v${health.data.version}` : '尚未确认'}</dd>
          </div>
          <div>
            <dt>服务状态</dt>
            <dd>
              {health.isError ? '本机服务未连接' : health.isPending ? '正在检查…' : '本机服务正常'}
            </dd>
          </div>
          <div>
            <dt>备份与恢复</dt>
            <dd>
              <Link className="text-link" to="/data">
                打开「数据」页
              </Link>
            </dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
