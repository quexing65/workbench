import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { toggleTheme } from './preferences';
import { DATE_STEP_EVENT, NAV_KEY_ROUTES, NEW_INPUT_SELECTOR } from './shortcuts';

const NAV_PREFIX_MS = 1500;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * 全局快捷键：G 前缀导航、N 聚焦新建、D 切主题、[ / ] 任务页换日期、? 速查表。
 * 在输入控件内、按住修饰键时、或有 alertdialog/dialog 打开时一律不响应。
 */
export function useGlobalShortcuts(onToggleHelp: () => void): void {
  const navigate = useNavigate();
  // 渲染期间不能写 ref（react-hooks/refs）；每次提交后同步最新回调，
  // 键盘监听器就能始终调用最新的 onToggleHelp，而无需随回调重建。
  const helpRef = useRef(onToggleHelp);
  useEffect(() => {
    helpRef.current = onToggleHelp;
  }, [onToggleHelp]);

  useEffect(() => {
    let armedTimer: number | null = null;
    const disarm = () => {
      if (armedTimer !== null) window.clearTimeout(armedTimer);
      armedTimer = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return;

      if (armedTimer !== null) {
        const route = NAV_KEY_ROUTES[event.key.toLowerCase()];
        disarm();
        if (route !== undefined) {
          event.preventDefault();
          navigate(route);
          return;
        }
        // 前缀后按下无关键：吃掉 G 序列，不做单键动作，避免误解为 D 切主题。
        if (event.key.length === 1) event.preventDefault();
        return;
      }

      switch (event.key) {
        case 'g':
        case 'G':
          armedTimer = window.setTimeout(disarm, NAV_PREFIX_MS);
          return;
        case '?':
          event.preventDefault();
          helpRef.current();
          return;
        case 'd':
        case 'D':
          event.preventDefault();
          toggleTheme();
          return;
        case 'n':
        case 'N': {
          const target = document.querySelector<HTMLElement>(NEW_INPUT_SELECTOR);
          if (target !== null) {
            event.preventDefault();
            target.focus();
          }
          return;
        }
        case '[':
        case ']':
          event.preventDefault();
          window.dispatchEvent(
            new CustomEvent(DATE_STEP_EVENT, { detail: event.key === '[' ? -1 : 1 }),
          );
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      disarm();
    };
  }, [navigate]);
}
