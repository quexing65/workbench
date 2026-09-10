import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from './app/preferences';
import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import './styles.css';

// 首帧渲染前落好 data-theme，避免浅/深色闪现。
initTheme();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('缺少应用根节点');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
