import { useEffect, useMemo, useState } from 'react';
import type { CollectionItem, CollectionType, SeasonSort, Settings, Subject } from '../../electron/shared/types';
import { SubjectCard } from '../components/SubjectCard';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../hooks/useToast';
import { quarterMonths, quarterName, seasonLabel } from '../lib/format';

interface Props {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => Promise<Settings>;
  collections: CollectionItem[];
  onCollect: (subject: Subject, type: CollectionType) => void;
  onOpen: (subject: Subject) => void;
}

const QUARTERS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
const SORTS: Array<{ key: SeasonSort; label: string }> = [
  { key: 'score', label: '评分' },
  { key: 'heat', label: '热度' },
  { key: 'rank', label: '排名' },
];

/** 季度索引：按评分 / 热度 / 排名排序浏览每季动画 */
export function SeasonView({ settings, onSettings, collections, onCollect, onOpen }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyRated, setOnlyRated] = useState(false);

  const { seasonYear, seasonQuarter, seasonSort } = settings;
  /** 后台刷新状态：refreshing 时顶部显示进度 */
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  const keyOf = (y: number, q: number, s: string) => `${y}-${q}-${s}`;
  const currentKey = keyOf(seasonYear, seasonQuarter, seasonSort);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const accept = (payload: { year: number; quarter: number; sort: string; items: Subject[]; source: string; done: boolean }) => {
      // 只接受当前选择的季度/排序，避免切换后旧请求覆盖新数据
      if (!alive || keyOf(payload.year, payload.quarter, payload.sort) !== currentKey) return;
      setItems(payload.items);
      setFromCache(payload.source === 'cache');
      setRefreshing(!payload.done);
      if (payload.items.length) setLoading(false);
    };

    // 后台刷新时主进程会持续推送
    const off = window.api.on.seasonUpdate(accept);

    window.api.season
      .list(seasonYear, seasonQuarter, seasonSort)
      .then(accept)
      .catch((err: Error) => {
        if (!alive) return;
        setError(err.message);
        toast.push('error', err.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      off();
    };
  }, [seasonYear, seasonQuarter, seasonSort, currentKey, toast]);

  const typeOf = useMemo(() => new Map(collections.map((c) => [c.subjectId, c.type])), [collections]);
  const visible = useMemo(
    () => (onlyRated ? items.filter((s) => (s.rating?.score ?? 0) > 0) : items),
    [items, onlyRated],
  );

  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => void onSettings({ seasonYear: seasonYear - 1 })}
            className="rounded-md px-1.5 py-1 text-ink-500 transition hover:bg-ink-800 hover:text-ink-200"
            title="上一年"
          >
            ‹
          </button>
          <span className="min-w-[4.5rem] text-center text-sm font-medium tabular-nums text-ink-100">
            {seasonYear}
          </span>
          <button
            onClick={() => void onSettings({ seasonYear: seasonYear + 1 })}
            disabled={seasonYear >= thisYear + 1}
            className="rounded-md px-1.5 py-1 text-ink-500 transition hover:bg-ink-800 hover:text-ink-200 disabled:opacity-30"
            title="下一年"
          >
            ›
          </button>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-ink-800">
          {QUARTERS.map((q) => (
            <button
              key={q}
              onClick={() => void onSettings({ seasonQuarter: q })}
              className={`px-2.5 py-1 text-xs transition ${
                seasonQuarter === q ? 'bg-brand-500 text-white' : 'text-ink-400 hover:bg-ink-800'
              }`}
              title={`${seasonLabel(seasonYear, q)}（${quarterMonths(q)}）`}
            >
              {quarterName(q)}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-lg border border-ink-800">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => void onSettings({ seasonSort: s.key })}
              className={`px-2.5 py-1 text-xs transition ${
                seasonSort === s.key ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-ink-400">
          <input
            type="checkbox"
            checked={onlyRated}
            onChange={(e) => setOnlyRated(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          只看有评分
        </label>

        <span className="ml-auto flex items-center gap-2 text-xs text-ink-500">
          {refreshing && (
            <span className="flex items-center gap-1 text-ink-400" title="正在后台更新本季数据">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-ink-600 border-t-brand-500" />
              后台更新中
            </span>
          )}
          {loading && !items.length
            ? '加载中…'
            : `${seasonLabel(seasonYear, seasonQuarter)} · ${visible.length} 部${fromCache && !refreshing ? ' · 缓存' : ''}`}
        </span>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <p className="text-sm text-rose-300">{error}</p>
          <p className="text-xs text-ink-500">请检查网络或代理设置</p>
          <button
            onClick={() => void onSettings({ seasonSort: seasonSort })}
            className="rounded-lg border border-ink-700 px-3 py-1 text-xs text-ink-300"
          >
            重新设置以重试
          </button>
        </div>
      ) : loading && !items.length ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : visible.length ? (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((s) => (
            <SubjectCard
              key={s.id}
              subject={s}
              currentType={typeOf.get(s.id)}
              onCollect={(subject, type) => onCollect(subject, type as CollectionType)}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-ink-500">该季度没有数据</div>
      )}
    </div>
  );
}
