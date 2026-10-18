import { useEffect, useRef, useState } from 'react';
import { subjectTitle } from '../lib/format';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

/** 全局搜索框：Ctrl+K 聚焦，Esc 清空 */
export function SearchBox({ value, onChange, onSubmit, placeholder = '搜索番剧（Ctrl+K）' }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`flex flex-1 items-center gap-2 rounded-xl border bg-ink-900/70 px-3 transition ${
        active ? 'border-brand-500/60 ring-2 ring-brand-500/15' : 'border-ink-800 hover:border-ink-700'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            ref.current?.blur();
          }
          if (e.key === 'Enter') onSubmit?.();
        }}
        placeholder={placeholder}
        className="h-10 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="rounded-md px-1 text-xs text-ink-500 hover:text-ink-200"
          title="清空"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Title({ nameCn, name }: { nameCn?: string; name: string }) {
  return <span>{subjectTitle({ nameCn, name })}</span>;
}
