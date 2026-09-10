import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadPreferences() {
  return import('../app/preferences');
}

describe('theme preferences', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['theme'];
    window.localStorage.clear();
  });

  it('defaults to light and applies data-theme on init', async () => {
    const prefs = await loadPreferences();
    prefs.initTheme();
    expect(prefs.getThemeMode()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('persists the chosen mode and paints dark', async () => {
    const prefs = await loadPreferences();
    prefs.initTheme();
    prefs.setThemeMode('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(window.localStorage.getItem('workbench-theme')).toBe('dark');
  });

  it('toggles between light and dark', async () => {
    const prefs = await loadPreferences();
    prefs.initTheme();
    prefs.toggleTheme();
    expect(prefs.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    prefs.toggleTheme();
    expect(prefs.isDark()).toBe(false);
  });

  it('restores the stored mode on next load', async () => {
    window.localStorage.setItem('workbench-theme', 'dark');
    const prefs = await loadPreferences();
    prefs.initTheme();
    expect(prefs.getThemeMode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('follows the system scheme in system mode and reacts to changes', async () => {
    // 用容器对象捕获监听器，绕过 TS 对闭包内赋值的控制流收窄。
    const captured: { onChange: ((event: { matches: boolean }) => void) | null } = {
      onChange: null,
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: (_event: string, callback: (event: { matches: boolean }) => void) => {
          captured.onChange = callback;
        },
        removeEventListener: vi.fn(),
      })),
    );
    const prefs = await loadPreferences();
    prefs.initTheme();
    prefs.setThemeMode('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    captured.onChange?.({ matches: false });
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
