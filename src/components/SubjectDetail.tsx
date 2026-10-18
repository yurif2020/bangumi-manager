import { useEffect, useMemo, useState } from 'react';
import type { CollectionItem, CollectionType, Episode, Subject } from '../../electron/shared/types';
import { CommentList } from './CommentList';
import { CoverImage } from './CoverImage';
import { EpisodeList } from './EpisodeList';
import { Lightbox } from './Lightbox';
import { ProgressBar } from './ProgressBar';
import { RatingStars } from './RatingStars';
import { SkeletonLines } from './Skeleton';
import { ratingOf, subjectSubTitle, subjectTitle, yearOf } from '../lib/format';
import { totalEpisodesOf } from '../lib/progress';
import type { useEpisodeActions } from '../hooks/useEpisodeActions';

interface Props {
  subject: Subject;
  item?: CollectionItem;
  onClose: () => void;
  actions: ReturnType<typeof useEpisodeActions>;
  onChanged: () => void;
}

/** 详情页签：章节 / 简介 / 短评 */
const TABS: Array<{ key: 'episodes' | 'summary' | 'comments'; label: string }> = [
  { key: 'episodes', label: '章节' },
  { key: 'summary', label: '简介' },
  { key: 'comments', label: '短评' },
];

const STATUS_BUTTONS: Array<[CollectionType, string]> = [
  [3, '在看'],
  [1, '想看'],
  [2, '看过'],
  [4, '搁置'],
  [5, '抛弃'],
];

/** 详情面板：简介、收藏状态、章节列表与逐集操作 */
export function SubjectDetail({ subject, item, onClose, actions, onChanged }: Props) {
  const [detail, setDetail] = useState<Subject>(subject);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [watched, setWatched] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState(false);
  const [jump, setJump] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(0);
  const [tab, setTab] = useState<'episodes' | 'summary' | 'comments'>('episodes');
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      window.api.subject.get(subject.id).catch(() => subject),
      window.api.subject.episodes(subject.id),
    ])
      .then(([full, bundle]) => {
        if (!alive) return;
        setDetail(full);
        setEpisodes(bundle.episodes);
        setWatched(new Set(bundle.watched));
        setFound(bundle.found);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [subject, touched]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = totalEpisodesOf(detail, episodes);
  const watchedCount = useMemo(
    () => [...watched].filter((id) => episodes.find((e) => e.id === id)?.type === 0).length,
    [watched, episodes],
  );

  const afterAction = () => {
    setTouched((n) => n + 1);
    onChanged();
  };

  const toggle = async (ep: Episode) => {
    const isWatched = watched.has(ep.id);
    setWatched((prev) => {
      const next = new Set(prev);
      if (isWatched) next.delete(ep.id);
      else next.add(ep.id);
      return next;
    });
    const ok = await actions.toggle(subject.id, ep, isWatched, watchedCount);
    if (!ok) {
      setWatched((prev) => {
        const next = new Set(prev);
        if (isWatched) next.add(ep.id);
        else next.delete(ep.id);
        return next;
      });
    }
    afterAction();
  };

  const markNext = async () => {
    const done = await actions.markNext(subject.id, episodes, watched);
    if (done) {
      setWatched((prev) => new Set(prev).add(done.id));
      afterAction();
    }
  };

  const markAll = async () => {
    await actions.markAll(subject.id, episodes, watched);
    afterAction();
  };

  const jumpTo = async () => {
    const value = Number(jump);
    if (!Number.isFinite(value) || value <= 0) return;
    const done = await actions.jumpTo(subject.id, episodes, watched, value);
    if (done.length) {
      setWatched((prev) => {
        const next = new Set(prev);
        done.forEach((ep) => next.add(ep.id));
        return next;
      });
      setJump('');
    }
    afterAction();
  };

  const markFirstUnwatchedUndo = async () => {
    const lastWatched = [...episodes]
      .filter((e) => watched.has(e.id))
      .sort((a, b) => b.sort - a.sort)[0];
    if (!lastWatched) return;
    setWatched((prev) => {
      const next = new Set(prev);
      next.delete(lastWatched.id);
      return next;
    });
    await actions.undoOne(subject.id, lastWatched, watchedCount);
    afterAction();
  };

  const cover = detail.images?.large || detail.images?.common;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <section
        className="flex h-full w-[min(600px,94vw)] animate-fade-up flex-col border-l border-ink-800 bg-ink-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-ink-800/80 p-4">
          <button
            onClick={() => cover && setZoom(true)}
            disabled={!cover}
            title={cover ? '点击查看高清大图' : '没有封面'}
            className="shrink-0 transition hover:opacity-90 disabled:cursor-default"
          >
            <CoverImage src={cover} alt={subjectTitle(detail)} className="w-[80px] rounded-lg" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-ink-100">{subjectTitle(detail)}</h2>
            {subjectSubTitle(detail) && (
              <p className="truncate text-xs text-ink-500">{subjectSubTitle(detail)}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-400">
              <span>{yearOf(detail.date) || '未定'}</span>
              <span>★ {ratingOf(detail)}</span>
              {detail.rating?.rank ? <span>排名 #{detail.rating.rank}</span> : null}
              {detail.platform ? <span>{detail.platform}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUS_BUTTONS.map(([type, label]) => (
                <button
                  key={type}
                  onClick={async () => {
                    const res = await actions.setCollection(detail, type, item);
                    if (res.ok) afterAction();
                  }}
                  className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                    item?.type === type
                      ? 'bg-brand-500 text-white'
                      : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
                  }`}
                >
                  {label}
                </button>
              ))}
              {item && (
                <button
                  onClick={async () => {
                    const res = await actions.setCollection(detail, 0, item);
                    if (res.ok) afterAction();
                  }}
                  className="rounded-md px-2 py-0.5 text-[11px] text-ink-500 hover:text-rose-300"
                >
                  取消收藏
                </button>
              )}
            </div>
            <div className="mt-2">
              <RatingStars
                value={item?.rate ?? 0}
                disabled={!item?.type}
                busy={actions.busy}
                onChange={async (rate) => {
                  const ok = await actions.rate(detail, rate, item);
                  if (ok) afterAction();
                }}
              />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
            title="关闭（Esc）"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 border-b border-ink-800/80 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>
              进度 <span className="text-ink-100">{found ? watchedCount : item?.epStatus ?? 0}</span> /{' '}
              {total || '?'}
            </span>
            <span className="text-ink-500">{loading ? '加载中…' : found ? '已同步' : '未收藏 / 未记录'}</span>
          </div>
          <ProgressBar watched={found ? watchedCount : item?.epStatus ?? 0} total={total || 1} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={markNext}
              disabled={actions.busy || loading || !episodes.length}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              下一集 +1
            </button>
            <button
              onClick={markAll}
              disabled={actions.busy || loading || !episodes.length}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:border-ink-600 disabled:opacity-50"
            >
              补满全季
            </button>
            <div className="flex items-center gap-1.5">
              <input
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void jumpTo()}
                placeholder="跳到第几集"
                inputMode="numeric"
                className="w-24 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
              />
              <button
                onClick={jumpTo}
                disabled={actions.busy || !jump}
                className="rounded-lg border border-ink-700 px-2 py-1.5 text-xs text-ink-300 hover:border-ink-600 disabled:opacity-50"
              >
                跳集
              </button>
            </div>
            <button
              onClick={markFirstUnwatchedUndo}
              disabled={actions.busy || watchedCount === 0}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:border-ink-600 disabled:opacity-40"
              title="撤销最后看的一集"
            >
              撤销
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-ink-800/80 px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs transition ${
                tab === t.key
                  ? 'border-brand-500 text-ink-100'
                  : 'border-transparent text-ink-500 hover:text-ink-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tab === 'episodes' ? (
            error ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <p className="text-xs text-rose-300">{error}</p>
                <button
                  onClick={() => setTouched((n) => n + 1)}
                  className="rounded-lg border border-ink-700 px-3 py-1 text-xs text-ink-300"
                >
                  重试
                </button>
              </div>
            ) : loading && !episodes.length ? (
              <SkeletonLines rows={8} />
            ) : (
              <EpisodeList episodes={episodes} watched={watched} onToggle={toggle} />
            )
          ) : tab === 'summary' ? (
            <div className="px-2 py-1">
              {detail.summary ? (
                <>
                  {detail.summaryTranslated && (
                    <span className="mb-1 inline-block rounded bg-ink-800 px-1 text-[10px] text-ink-500">
                      机器翻译
                    </span>
                  )}
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-400">
                    {detail.summary}
                  </p>
                </>
              ) : (
                <p className="py-6 text-center text-xs text-ink-500">暂无剧情简介</p>
              )}
            </div>
          ) : (
            <CommentList
              showRate
              load={(page) => window.api.subject.comments(detail.id, page)}
              emptyText="还没有短评"
            />
          )}
        </div>
      </section>
      {zoom && cover && <Lightbox src={cover} alt={subjectTitle(detail)} onClose={() => setZoom(false)} />}
    </div>
  );
}
