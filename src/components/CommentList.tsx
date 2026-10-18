import { useCallback, useEffect, useState } from 'react';
import type { CommentPage, UserComment } from '../../electron/shared/types';
import { SkeletonRow } from './Skeleton';

interface Props {
  /** 加载某一页评论；page 从 1 开始 */
  load: (page: number) => Promise<CommentPage>;
  /** 空状态文案 */
  emptyText?: string;
  /** 是否显示评分（条目短评有，单集吐槽没有） */
  showRate?: boolean;
}

function formatWhen(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const AVATAR_FALLBACK = 'bg-ink-800 text-ink-400';

function Avatar({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${AVATAR_FALLBACK}`}>
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-full bg-ink-800 object-cover"
    />
  );
}

export function CommentItem({ comment, showRate }: { comment: UserComment; showRate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = comment.content.length > 140;
  const text = long && !expanded ? `${comment.content.slice(0, 140)}…` : comment.content;
  return (
    <li className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-ink-900/60">
      <Avatar src={comment.avatar} name={comment.userName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="truncate font-medium text-ink-300">{comment.userName}</span>
          {showRate && comment.rate > 0 && (
            <span className="shrink-0 rounded bg-amber-500/15 px-1 text-amber-300">★ {comment.rate}</span>
          )}
          <span className="ml-auto shrink-0 text-ink-600">{formatWhen(comment.createdAt)}</span>
        </div>
        <p
          className={`mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-400 ${
            long && !expanded ? 'cursor-pointer' : ''
          }`}
          onClick={() => long && setExpanded((v) => !v)}
          title={long && !expanded ? '点击展开' : undefined}
        >
          {text}
        </p>
        {long && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-[11px] text-brand-400 hover:text-brand-500"
          >
            {expanded ? '收起' : '展开全文'}
          </button>
        )}
        {comment.replies?.length ? (
          <ul className="mt-1.5 space-y-1 border-l border-ink-800 pl-2.5">
            {comment.replies.map((r) => (
              <li key={r.id} className="text-[11px] leading-relaxed text-ink-500">
                <span className="font-medium text-ink-400">{r.userName}：</span>
                {r.content}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

/** 评论列表：自动加载首页，支持「加载更多」 */
export function CommentList({ load, emptyText = '还没有评论', showRate }: Props) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<UserComment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await load(p);
        setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  if (loading && !items.length) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (error && !items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <p className="text-xs text-rose-300">{error}</p>
        <button
          onClick={() => void fetchPage(1)}
          className="rounded-lg border border-ink-700 px-3 py-1 text-xs text-ink-300 hover:border-ink-600"
        >
          重试
        </button>
      </div>
    );
  }

  if (!items.length) {
    return <p className="py-6 text-center text-xs text-ink-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {items.map((c) => (
          <CommentItem key={c.id} comment={c} showRate={showRate} />
        ))}
      </ul>
      <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-ink-500">
        <span>
          已显示 {items.length} / {total}
        </span>
        {items.length < total && (
          <button
            onClick={() => void fetchPage(page + 1)}
            disabled={loading}
            className="rounded-md border border-ink-700 px-2 py-0.5 text-ink-300 hover:border-ink-600 disabled:opacity-50"
          >
            {loading ? '加载中…' : '加载更多'}
          </button>
        )}
      </div>
    </div>
  );
}
