import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { HealthStatus } from '../shared/ui/HealthStatus';
import { navigationItems } from './navigation';

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? 'mobile-nav' : 'side-nav'} aria-label="主要导航">
      {navigationItems.map((item) => (
        <NavLink
          className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
          end
          key={item.to}
          to={item.to}
        >
          <span className="nav-link__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="nav-link__label">{mobile ? item.shortLabel : item.label}</span>
        </NavLink>
      ))}
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

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <div className="brand" aria-label="Personal Workbench">
          <span className="brand__mark" aria-hidden="true">
            W
          </span>
          <span>
            <strong>Workbench</strong>
            <small>个人工作台</small>
          </span>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
        </div>
        <Navigation />
        <div className="sidebar__footer">
          <HealthStatus />
          <p>数据仅保存在这台设备</p>
        </div>
      </aside>

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

      <div className="mobile-nav-container">
        <Navigation mobile />
      </div>
    </div>
  );
}
