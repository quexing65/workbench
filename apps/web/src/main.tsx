import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import './styles.css';

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
