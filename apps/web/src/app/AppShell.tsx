import { ArrowLineLeft, ArrowLineRight, SidebarSimple } from '@phosphor-icons/react';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { HealthStatus } from '../shared/ui/HealthStatus';
import { navigationItems } from './navigation';

/** 三档侧栏的断点，与 shell.css 中 .app-shell--rail / .app-shell--drawer 样式对应：
 *  宽（>1100px）：完整侧栏，可手动折叠；
 *  中（641–1100px）：自动收窄为图标栏；
 *  窄（<=640px）：侧栏收进屏外，由左侧把手按钮呼出抽屉。 */
const RAIL_QUERY = '(min-width: 641px) and (max-width: 1100px)';
const DRAWER_QUERY = '(max-width: 640px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

function Navigation({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <nav className="side-nav" aria-label="主要导航">
      {navigationItems.map((item) => {
        const Glyph = item.icon;
        return (
          <NavLink
            className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
            end
            key={item.to}
            to={item.to}
            viewTransition
            onClick={onNavigate}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    aria-hidden="true"
                    className="side-nav__glider"
                    layoutId="side-nav-glider"
                    transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
                  />
                )}
                <span className="nav-link__icon" aria-hidden="true">
                  <Glyph className="nav-link__glyph nav-link__glyph--outline" weight="regular" />
                  <Glyph className="nav-link__glyph nav-link__glyph--fill" weight="fill" />
                </span>
                <span className="nav-link__label-wrap">
                  <span className="nav-link__label">{item.label}</span>
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('workbench-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isRail = useMediaQuery(RAIL_QUERY);
  const isDrawer = useMediaQuery(DRAWER_QUERY);

  // 离开窄屏档位时收起抽屉，避免拖宽窗口后遮罩与抽屉悬挂在页面上。
  // 用官方认可的"渲染期间按状态变化重置"写法，替代 effect 里的同步 setState。
  const [wasDrawer, setWasDrawer] = useState(isDrawer);
  if (wasDrawer !== isDrawer) {
    setWasDrawer(isDrawer);
    if (!isDrawer) setDrawerOpen(false);
  }

  // 抽屉打开时支持 Escape 收起，键盘用户不必寻找遮罩按钮。
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('workbench-sidebar-collapsed', String(next));
      } catch {
        // The layout still works when browser storage is unavailable.
      }
      return next;
    });
  }

  const shellClass = [
    'app-shell',
    // 中档强制图标栏；宽档沿用用户的手动折叠偏好。
    isRail || (!isDrawer && sidebarCollapsed) ? 'app-shell--sidebar-collapsed' : '',
    isRail ? 'app-shell--rail' : '',
    isDrawer ? 'app-shell--drawer' : '',
    isDrawer && drawerOpen ? 'app-shell--drawer-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <MotionConfig reducedMotion="user">
      <div className={shellClass}>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        <aside className="sidebar">
          <div className="brand" aria-label="Personal Workbench">
            <button
              type="button"
              className="brand__mark brand-toggle"
              aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              aria-expanded={!sidebarCollapsed}
              onClick={toggleSidebar}
            >
              <span className="brand-toggle__glyph brand-toggle__glyph--mark" aria-hidden="true">
                W
              </span>
              {sidebarCollapsed ? (
                <ArrowLineRight
                  aria-hidden="true"
                  className="brand-toggle__glyph brand-toggle__glyph--action"
                  size={18}
                  weight="fill"
                />
              ) : (
                <ArrowLineLeft
                  aria-hidden="true"
                  className="brand-toggle__glyph brand-toggle__glyph--action"
                  size={18}
                  weight="fill"
                />
              )}
            </button>
            <span className="brand__name">
              <strong>Workbench</strong>
            </span>
          </div>
          <Navigation onNavigate={isDrawer ? () => setDrawerOpen(false) : undefined} />
          <div className="sidebar__footer">
            <HealthStatus />
            <p>数据仅保存在这台设备</p>
          </div>
        </aside>

        {isDrawer && drawerOpen ? (
          <button
            type="button"
            className="drawer-scrim"
            aria-label="关闭导航"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <div className="workspace">
          <header className="mobile-header">
            <div className="brand brand--mobile">
              <span className="brand__mark" aria-hidden="true">
                W
              </span>
              <strong>Workbench</strong>
            </div>
            <HealthStatus />
          </header>
          <main id="main-content" className="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>

        {isDrawer ? (
          <button
            type="button"
            className="drawer-handle"
            aria-label={drawerOpen ? '收起导航' : '打开导航'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((current) => !current)}
          >
            <SidebarSimple aria-hidden="true" size={20} weight={drawerOpen ? 'fill' : 'regular'} />
          </button>
        ) : null}
      </div>
    </MotionConfig>
  );
}
