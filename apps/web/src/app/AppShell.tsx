import { NavLink, Outlet } from 'react-router-dom';
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
          <span>{mobile ? item.shortLabel : item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="app-shell">
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
