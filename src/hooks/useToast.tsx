import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Toasts, type ToastItem } from '../components/Toasts';

const ToastContext = createContext<{
  push: (kind: ToastItem['kind'], text: string) => void;
}>({ push: () => undefined });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    setItems((prev) => [...prev.slice(-3), { id: Date.now() + Math.random(), kind, text }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toasts items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
