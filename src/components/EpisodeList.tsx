import { useEffect, useState } from 'react';
import type { Episode } from '../../electron/shared/types';
import { CommentList } from './CommentList';
import { formatDate } from '../lib/format';

interface Props {
  episodes: Episode[];
  watched: Set<number>;
  onToggle: (ep: Episode) => void;
  loading?: boolean;
}

/** 单集展开区：剧情简介 + 吐槽，首次展开时才请求 */
function EpisodeInfo({ episode }: { episode: Episode }) {
  const [tab, setTab] = useState<'desc' | 'comments'>('desc');
  const [desc, setDesc] = useState<string | null>(null);
  const [translated, setTranslated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDesc(null);
    setTranslated(false);
    setError(null);
    window.api.episode
      .detail(episode.id)
      .then((res) => {
        if (!alive) return;
        setDesc(res.desc ?? '');
        setTranslated(!!res.translated);
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [episode.id]);

  return (
    <div className="mt-1 rounded-lg bg-ink-900/60 p-2">
      <div className="mb-1.5 flex gap-1">
        {(
          [
            ['desc', '剧情简介'],
            ['comments', `评论${episode.comment ? ` (${episode.comment})` : ''}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-2 py-0.5 text-[11px] transition ${
              tab === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:text-ink-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'desc' ? (
        error ? (
          <p className="px-1 py-3 text-[11px] text-rose-300">{error}</p>
        ) : desc === null ? (
          <div className="h-10 animate-pulse rounded bg-ink-800/70" />
        ) : desc.trim() ? (
          <div className="px-1">
            {translated && (
              <span className="mb-1 inline-block rounded bg-ink-800 px-1 text-[10px] text-ink-500">
                机器翻译
              </span>
            )}
            <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-400">
              {desc}
            </p>
          </div>
        ) : (
          <p className="px-1 py-3 text-center text-[11px] text-ink-500">这一集还没有剧情简介</p>
        )
      ) : (
        <CommentList
          load={() => window.api.episode.comments(episode.id)}
          emptyText="这一集还没有评论"
        />
      )}
    </div>
  );
}

export function EpisodeList({ episodes, watched, onToggle, loading }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-ink-900/70" />
        ))}
      </div>
    );
  }

  if (!episodes.length) {
    return <p className="py-6 text-center text-xs text-ink-500">暂无章节信息</p>;
  }

  return (
    <ul className="space-y-1">
      {episodes.map((ep) => {
        const isWatched = watched.has(ep.id);
        const open = openId === ep.id;
        const title = ep.nameCn || ep.name || `第 ${ep.sort} 集`;
        // 0 本篇，1 SP，2 OP，3 ED …
        const kind = ep.type === 1 ? 'SP' : ep.type === 2 ? 'OP' : ep.type === 3 ? 'ED' : '';
        return (
          <li key={ep.id}>
            <div
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition ${
                isWatched ? 'text-ink-500' : 'text-ink-200'
              } ${open ? 'bg-ink-900' : 'hover:bg-ink-900'}`}
            >
              <button
                onClick={() => onToggle(ep)}
                title={isWatched ? '取消已看' : '标记为已看'}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                  isWatched ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-600'
                }`}
              >
                {isWatched && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setOpenId(open ? null : ep.id)}
                title="查看剧情简介与评论"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="w-10 shrink-0 text-xs tabular-nums text-ink-500">
                  {kind || (ep.sort ? ep.sort.toFixed(ep.sort % 1 === 0 ? 0 : 1) : '-')}
                </span>
                <span className={`min-w-0 flex-1 truncate ${isWatched ? 'line-through decoration-ink-600' : ''}`}>
                  {title}
                </span>
                {ep.comment ? (
                  <span className="shrink-0 text-[11px] text-ink-600">{ep.comment} 评</span>
                ) : null}
                <span className="shrink-0 text-[11px] text-ink-600">{formatDate(ep.airdate)}</span>
                <span
                  className={`shrink-0 text-ink-600 transition-transform ${open ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  ›
                </span>
              </button>
            </div>
            {open && <EpisodeInfo episode={ep} />}
          </li>
        );
      })}
    </ul>
  );
}
