export function SkeletonCard() {
  return (
    <div className="flex animate-pulse gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3">
      <div className="h-[108px] w-[72px] rounded-lg bg-ink-800" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-2/3 rounded bg-ink-800" />
        <div className="h-3 w-1/2 rounded bg-ink-800/70" />
        <div className="h-3 w-1/3 rounded bg-ink-800/70" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return <div className="h-12 animate-pulse rounded-lg bg-ink-900/60" />;
}

/** 详情页章节骨架：rows 控制行数 */
export function SkeletonLines({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
