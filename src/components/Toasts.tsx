import { useEffect } from 'react';

export interface ToastItem {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

const tones: Record<ToastItem['kind'], string> = {
  info: 'border-ink-700 bg-ink-900/95 text-ink-100',
  success: 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
  error: 'border-rose-500/30 bg-rose-950/90 text-rose-100',
};

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (!items.length) return;
    const timers = items.map((t) => setTimeout(() => onDismiss(t.id), 3600));
    return () => timers.forEach(clearTimeout);
  }, [items, onDismiss]);

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-[min(420px,90vw)] -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto animate-fade-up cursor-pointer rounded-xl border px-4 py-2.5 text-sm shadow-card backdrop-blur ${tones[t.kind]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
