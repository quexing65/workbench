import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

interface ToastEntry {
  readonly id: number;
  readonly message: string;
}

interface ToastApi {
  readonly push: (message: string) => void;
}

const AUTO_DISMISS_MS = 3200;
const MAX_VISIBLE = 3;

const noopApi: ToastApi = { push: () => undefined };

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

/**
 * 轻量成功反馈：写操作成功后不再只有静默刷新。
 * 页面可脱离 Provider 直接渲染（单测常如此），此时 useToast 返回 no-op。
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const push = useCallback(
    (message: string) => {
      const id = nextId;
      nextId += 1;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-label="操作反馈">
        {toasts.map((entry) => (
          <div className="toast" key={entry.id}>
            {entry.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noopApi;
}
