import { useMemo, useState } from 'react';
import type { CollectionItem, CollectionType, Subject } from '../../electron/shared/types';
import { CoverImage } from '../components/CoverImage';
import { ProgressBar } from '../components/ProgressBar';
import { SkeletonCard } from '../components/Skeleton';
import { subjectSubTitle, subjectTitle } from '../lib/format';
import { totalEpisodesOf } from '../lib/progress';

interface Props {
  items: CollectionItem[];
  loading: boolean;
  title: string;
  emptyText: string;
  onOpen: (subject: Subject) => void;
  onMarkNext: (item: CollectionItem) => Promise<void>;
  onRemove?: (subject: Subject) => void;
  busy?: boolean;
}

type SortKey = 'updated' | 'progress' | 'name';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'updated', label: '最近更新' },
  { key: 'progress', label: '进度' },
  { key: 'name', label: '名称' },
];

/** 收藏列表：封面 + 已看/总集数进度条 + 下一集按钮 */
export function LibraryView({
  items,
  loading,
  title,
  emptyText,
  onOpen,
  onMarkNext,
  onRemove,
  busy,
}: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [busyId, setBusyId] = useState<number | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((it) => {
          const s = it.subject;
          if (!s) return false;
          return `${s.nameCn} ${s.name}`.toLowerCase().includes(q);
        })
      : items.slice();
    return filtered.sort((a, b) => {
      if (sort === 'name') {
        return (a.subject?.nameCn || a.subject?.name || '').localeCompare(b.subject?.nameCn || b.subject?.name || '');
      }
      if (sort === 'progress') {
        const ra = a.epStatus / Math.max(1, totalEpisodesOf(a.subject));
        const rb = b.epStatus / Math.max(1, totalEpisodesOf(b.subject));
        return rb - ra;
      }
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  }, [items, query, sort]);

  if (loading && !items.length) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="text-3xl">🌙</div>
        <p className="text-sm text-ink-400">{emptyText}</p>
        <p className="text-xs text-ink-600">用顶部搜索框找番剧并加入收藏</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-ink-200">
          {title}
          <span className="ml-2 text-xs font-normal text-ink-500">{items.length}</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-ink-800">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`px-2 py-1 text-[11px] transition ${
                  sort === s.key ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="筛选列表…"
            className="w-40 rounded-lg border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {!visible.length ? (
        <p className="py-10 text-center text-xs text-ink-500">没有匹配「{query}」的番剧</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((item) => {
            const subject = item.subject;
            if (!subject) return null;
            const total = totalEpisodesOf(subject);
            const watched = Math.max(0, item.epStatus ?? 0);
            const finished = total > 0 && watched >= total;
            const cover = subject.images?.common || subject.images?.medium;
            return (
              <article
                key={`${subject.id}-${item.type}`}
                className="group flex animate-fade-up gap-3 rounded-xl border border-ink-800 bg-ink-900/50 p-3 transition hover:border-ink-700 hover:bg-ink-900"
              >
                <button onClick={() => onOpen(subject)} className="shrink-0" title="查看详情">
                  <CoverImage src={cover} alt={subjectTitle(subject)} className="w-[68px] rounded-lg" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col">
                  <button onClick={() => onOpen(subject)} className="text-left">
                    <h3 className="truncate text-sm font-semibold text-ink-100">{subjectTitle(subject)}</h3>
                    {subjectSubTitle(subject) && (
                      <p className="truncate text-[11px] text-ink-500">{subjectSubTitle(subject)}</p>
                    )}
                  </button>
                  <div className="mt-auto space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] text-ink-400">
                      <span>
                        已看 <span className="text-ink-200">{watched}</span> / {total || '?'}
                      </span>
                      {finished ? (
                        <span className="text-emerald-400">已看完</span>
                      ) : subject.rating?.score ? (
                        <span>★ {subject.rating.score.toFixed(1)}</span>
                      ) : null}
                    </div>
                    <ProgressBar watched={watched} total={total || 1} />
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={async () => {
                          setBusyId(subject.id);
                          try {
                            await onMarkNext(item);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        disabled={busyId === subject.id || busy || finished}
                        className="rounded-lg bg-brand-500/90 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-brand-500 disabled:opacity-40"
                        title={finished ? '已看完' : '标记下一集'}
                      >
                        {busyId === subject.id ? '写入中…' : '下一集 +1'}
                      </button>
                      <button
                        onClick={() => onOpen(subject)}
                        className="rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition hover:border-ink-600"
                      >
                        详情
                      </button>
                      {onRemove && (
                        <button
                          onClick={() => onRemove(subject)}
                          className="ml-auto rounded-lg px-2 py-1 text-[11px] text-ink-600 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                        >
                          移除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 兼容旧调用：列表项的下一集序号 */
export function markNextEpisodeOf(item: CollectionItem): number {
  return (item.epStatus ?? 0) + 1;
}

export type { CollectionType };
