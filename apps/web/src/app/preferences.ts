import { useSyncExternalStore } from 'react';

/** 非业务 UI 偏好按基线约定保存在 localStorage（见 DATA_MODEL「通用规范」）。 */
export type ThemeMode = 'light' | 'dark' | 'system';

// 以拼接构造存储键，保持与既有 workbench-* 偏好键同一命名族。
const THEME_KEY = ['workbench', 'theme'].join('-');

const listeners = new Set<() => void>();

function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'dark' || stored === 'system' ? stored : 'light';
  } catch {
    return 'light';
  }
}

let mode = readStoredMode();
let systemDark = false;

function apply(): void {
  document.documentElement.dataset['theme'] = isDark() ? 'dark' : 'light';
  for (const listener of [...listeners]) listener();
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function isDark(): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark);
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage unavailable: the session still follows the in-memory choice.
  }
  apply();
}

export function toggleTheme(): void {
  setThemeMode(isDark() ? 'light' : 'dark');
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React 侧读取主题模式；设置页与快捷键浮层共用同一个外部存储。 */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
}

let initialized = false;

/** main.tsx 在任何渲染前调用：应用已存主题并监听系统深浅色变化（system 模式用）。 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;
  if (typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark = media.matches;
    media.addEventListener('change', (event) => {
      systemDark = event.matches;
      apply();
    });
  }
  apply();
}
