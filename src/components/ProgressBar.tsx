interface Props {
  watched: number;
  total: number;
  className?: string;
}

/** 已看 / 总集数进度条 */
export function ProgressBar({ watched, total, className = '' }: Props) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.max(0, Math.min(100, (watched / safeTotal) * 100));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-ink-800 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
