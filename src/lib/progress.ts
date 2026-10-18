import type { CollectionItem, Episode, Subject } from '../../electron/shared/types';

/** 单集进度视图模型 */
export interface EpisodeView {
  episodes: Episode[];
  watched: Set<number>;
  total: number;
  next?: Episode;
  /** 已看集数（只统计本篇） */
  watchedCount: number;
}

export function buildEpisodeView(bundle: { episodes: Episode[]; watched: number[] }, subject?: Subject): EpisodeView {
  const main = bundle.episodes.filter((e) => e.type === 0);
  const total = subject?.totalEpisodes || subject?.eps || main.length || bundle.episodes.length;
  const watchedSet = new Set(bundle.watched);
  const next = bundle.episodes.find((e) => !watchedSet.has(e.id));
  return {
    episodes: bundle.episodes,
    watched: watchedSet,
    total,
    next,
    watchedCount: bundle.episodes.filter((e) => e.type === 0 && watchedSet.has(e.id)).length,
  };
}

/** 找到下一集（按 sort 递增的第一个未看集） */
export function nextUnwatched(episodes: Episode[], watched: Set<number>): Episode | undefined {
  return [...episodes].sort((a, b) => a.sort - b.sort).find((e) => !watched.has(e.id));
}

/** 番剧总集数：优先官方字段，其次章节数量 */
export function totalEpisodesOf(subject?: Subject, episodes?: Episode[]): number {
  if (subject?.totalEpisodes) return subject.totalEpisodes;
  if (subject?.eps) return subject.eps;
  if (episodes) return episodes.filter((e) => e.type === 0).length;
  return 0;
}

/** 列表项的进度展示值：0..total */
export function progressOf(item: CollectionItem): number {
  return Math.max(0, item.epStatus ?? 0);
}
