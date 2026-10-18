import { useCallback, useMemo, useState } from 'react';
import type { CollectionItem, CollectionType, Episode, Subject } from '../../electron/shared/types';
import { nextUnwatched, totalEpisodesOf } from '../lib/progress';

export type Toast = (kind: 'info' | 'error' | 'success', text: string) => void;

interface Options {
  toast: Toast;
  /** 写入成功后由 App 统一刷新 */
  refresh: () => void;
  /** 乐观推进列表里的进度 */
  bumpProgress: (subjectId: number, epStatus: number) => void;
}

/** 单集 / 整季 / 跳集 / 撤销 的统一写入入口 */
export function useEpisodeActions({ toast, refresh, bumpProgress }: Options) {
  const [busy, setBusy] = useState(false);

  const markOne = useCallback(
    async (subjectId: number, ep: Episode): Promise<boolean> => {
      const res = await window.api.episode.markWatched(subjectId, ep.id, Number(ep.sort));
      if (!res.ok) {
        toast('error', res.error ?? '标记失败');
        return false;
      }
      if (res.queued) toast('info', '网络不稳定，已暂存，稍后自动同步');
      return true;
    },
    [toast],
  );

  const unmarkOne = useCallback(
    async (ep: Episode): Promise<boolean> => {
      const res = await window.api.episode.unmark(ep.id);
      if (!res.ok) {
        toast('error', res.error ?? '撤销失败');
        return false;
      }
      return true;
    },
    [toast],
  );

  const toggle = useCallback(
    async (subjectId: number, ep: Episode, isWatched: boolean, currentWatched: number): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      const ok = isWatched ? await unmarkOne(ep) : await markOne(subjectId, ep);
      if (ok) {
        const next = Math.max(0, currentWatched + (isWatched ? -1 : 1));
        bumpProgress(subjectId, next);
        refresh();
      }
      setBusy(false);
      return ok;
    },
    [busy, markOne, unmarkOne, bumpProgress, refresh],
  );

  /** 下一集 +1 */
  const markNext = useCallback(
    async (subjectId: number, episodes: Episode[], watched: Set<number>): Promise<Episode | null> => {
      if (busy) return null;
      const target = nextUnwatched(episodes, watched);
      if (!target) {
        toast('info', '已经全部看完了');
        return null;
      }
      setBusy(true);
      const ok = await markOne(subjectId, target);
      if (ok) {
        toast('success', `已标记第 ${target.sort} 集`);
        refresh();
      }
      setBusy(false);
      return ok ? target : null;
    },
    [busy, markOne, toast, refresh],
  );

  /** 跳集：把目标集之前的连续未看集一次性补齐（最多 50 集，避免误操作刷屏） */
  const jumpTo = useCallback(
    async (subjectId: number, episodes: Episode[], watched: Set<number>, targetSort: number) => {
      if (busy) return [];
      const pending = [...episodes]
        .sort((a, b) => a.sort - b.sort)
        .filter((e) => !watched.has(e.id) && Number(e.sort) <= targetSort)
        .slice(0, 50);
      if (!pending.length) {
        toast('info', '没有需要推进的集数');
        return [];
      }
      setBusy(true);
      const done: Episode[] = [];
      for (const ep of pending) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await markOne(subjectId, ep))) break;
        done.push(ep);
      }
      setBusy(false);
      if (done.length) {
        bumpProgress(subjectId, watched.size + done.length);
        toast('success', `已标记到第 ${done[done.length - 1].sort} 集`);
        refresh();
      }
      return done;
    },
    [busy, markOne, toast, bumpProgress, refresh],
  );

  /** 整季补满 */
  const markAll = useCallback(
    async (subjectId: number, episodes: Episode[], watched: Set<number>) => {
      const pending = episodes.filter((e) => e.type === 0 && !watched.has(e.id));
      if (!pending.length) {
        toast('info', '已经全部看完了');
        return;
      }
      setBusy(true);
      for (const ep of pending) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await markOne(subjectId, ep))) break;
      }
      setBusy(false);
      bumpProgress(subjectId, totalEpisodesOf(undefined, episodes));
      toast('success', '已补满全部集数');
      refresh();
    },
    [busy, markOne, toast, bumpProgress, refresh],
  );

  const undoOne = useCallback(
    async (subjectId: number, ep: Episode, currentWatched: number) => {
      setBusy(true);
      const ok = await unmarkOne(ep);
      if (ok) {
        bumpProgress(subjectId, Math.max(0, currentWatched - 1));
        toast('info', `已撤销第 ${ep.sort} 集`);
        refresh();
      }
      setBusy(false);
      return ok;
    },
    [unmarkOne, toast, bumpProgress, refresh],
  );

  /** 状态迁移：改成「看过」时询问是否补满进度 */
  const setCollection = useCallback(
    async (
      subject: Subject,
      type: CollectionType | 0,
      existing?: CollectionItem,
    ): Promise<{ ok: boolean; cancelled?: boolean }> => {
      let fillTo: number | undefined;
      if (type === 2) {
        const total = totalEpisodesOf(subject);
        const current = existing?.epStatus ?? 0;
        if (total > 0 && current < total) {
          const fill = window.confirm(
            `「${subject.nameCn || subject.name}」还有 ${total - current} 集未看，是否一并标记为已看完？`,
          );
          if (fill) fillTo = total;
        }
      }
      const res = await window.api.collection.set(subject.id, type);
      if (!res.ok) {
        if (res.error) toast('error', res.error);
        return { ok: false, cancelled: !res.error };
      }
      // 收藏接口不能直接写动画的 ep_status，补满进度需逐集写入
      if (fillTo !== undefined) {
        const eps = await window.api.subject.episodes(subject.id).catch(() => null);
        if (eps) {
          const watched = new Set(eps.watched);
          const todo = eps.episodes.filter((e) => e.type === 0 && !watched.has(e.id)).slice(0, fillTo);
          for (const ep of todo) {
            await window.api.episode.markWatched(subject.id, ep.id, ep.sort).catch(() => undefined);
          }
          bumpProgress(subject.id, fillTo);
          refresh();
        }
      }
      if (res.queued) toast('info', '网络不稳定，操作已暂存，稍后自动同步');
      return { ok: true };
    },
    [toast],
  );

  /** 评分：Bangumi 要求先收藏，rate 0 表示取消评分 */
  const rate = useCallback(
    async (subject: Subject, value: number, existing?: CollectionItem): Promise<boolean> => {
      if (!existing?.type) {
        toast('info', '先加入收藏才能评分');
        return false;
      }
      setBusy(true);
      const res = await window.api.collection.set(subject.id, existing.type, { rate: value });
      setBusy(false);
      if (!res.ok) {
        if (res.error) toast('error', res.error);
        return false;
      }
      toast('success', value > 0 ? `已评 ${value} 分` : '已取消评分');
      refresh();
      return true;
    },
    [toast, refresh],
  );

  const actions = useMemo(
    () => ({ toggle, markNext, jumpTo, markAll, undoOne, setCollection, rate }),
    [toggle, markNext, jumpTo, markAll, undoOne, setCollection, rate],
  );

  return { ...actions, busy };
}
