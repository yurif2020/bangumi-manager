import type {
  CollectionItem,
  CollectionType,
  CommentPage,
  CommentReply,
  Episode,
  SeasonSort,
  Subject,
  SubjectRating,
  UserComment,
} from '../shared/types';
import { apiFetch, p1Fetch } from './client';
import { toChinese } from './translate';

/* ----------------------------- 原始结构 ----------------------------- */

interface RawRating {
  score?: number;
  total?: number;
  rank?: number;
  total_rank?: number;
}

interface RawSubject {
  id: number;
  name: string;
  name_cn?: string;
  nameCN?: string;
  summary?: string;
  short_summary?: string;
  date?: string;
  air_weekday?: number;
  airWeekday?: number;
  eps?: number;
  total_episodes?: number;
  totalEpisodes?: number;
  platform?: string;
  rating?: RawRating;
  /** 收藏列表里的条目是扁平字段 */
  score?: number;
  rank?: number;
  collection_total?: number;
  images?: Record<string, string>;
  type?: number;
  tags?: { name: string; count: number }[];
  collection?: Record<string, number>;
}

function normalizeRating(raw?: RawRating): SubjectRating | undefined {
  if (!raw) return undefined;
  const score = raw.score ?? 0;
  const total = raw.total ?? 0;
  const rank = raw.rank ?? raw.total_rank;
  if (!score && !total && !rank) return undefined;
  return { score, total, rank };
}

function normalizeCollectionCount(raw?: Record<string, number>): Subject['collection'] {
  if (!raw) return undefined;
  return {
    wish: raw['1'] ?? raw.wish ?? 0,
    collect: raw['2'] ?? raw.collect ?? 0,
    doing: raw['3'] ?? raw.doing ?? 0,
    onHold: raw['4'] ?? raw.on_hold ?? 0,
    dropped: raw['5'] ?? raw.dropped ?? 0,
  };
}

export function normalizeSubject(raw: RawSubject): Subject {
  const rating: SubjectRating | undefined =
    normalizeRating(raw.rating) ??
    (raw.score || raw.rank
      ? { score: raw.score ?? 0, total: raw.collection_total ?? 0, rank: raw.rank || undefined }
      : undefined);
  return {
    id: raw.id,
    name: raw.name,
    nameCn: raw.nameCN || raw.name_cn || '',
    summary: raw.summary || raw.short_summary,
    date: raw.date,
    airWeekday: raw.air_weekday ?? raw.airWeekday,
    eps: raw.eps,
    totalEpisodes: raw.total_episodes ?? raw.totalEpisodes,
    platform: raw.platform,
    rating,
    images: raw.images
      ? {
          large: raw.images.large,
          common: raw.images.common,
          medium: raw.images.medium,
          small: raw.images.small,
          grid: raw.images.grid,
        }
      : undefined,
    type: raw.type,
    tags: raw.tags,
    collection: normalizeCollectionCount(raw.collection),
  };
}

interface RawEpisode {
  id: number;
  type?: number;
  name?: string;
  name_cn?: string;
  nameCN?: string;
  sort?: number;
  airdate?: string;
  comment?: number;
  duration?: string;
  ep?: number | null;
  subject_id?: number;
  subjectID?: number;
}

export function normalizeEpisode(raw: RawEpisode, subjectId?: number): Episode {
  return {
    id: raw.id,
    type: raw.type ?? 0,
    name: raw.name ?? '',
    nameCn: raw.nameCN || raw.name_cn || '',
    sort: raw.sort ?? raw.ep ?? 0,
    airdate: raw.airdate,
    comment: raw.comment,
    duration: raw.duration,
    ep: raw.ep ?? null,
    subjectId: raw.subjectID ?? raw.subject_id ?? subjectId,
  };
}

/* ----------------------------- 搜索 ----------------------------- */

export interface SearchResult {
  total: number;
  items: Subject[];
}

/** 官方搜索：POST /v0/search/subjects，支持分页 */
export async function searchSubjects(
  keyword: string,
  offset = 0,
  limit = 24,
): Promise<SearchResult> {
  const res = await apiFetch<{ data?: RawSubject[]; total?: number }>('/search/subjects', {
    method: 'POST',
    auth: false,
    body: { keyword, filter: { type: [2], nsfw: false } },
    query: { limit, offset },
  });
  const items = (res.data ?? []).map(normalizeSubject);
  return { total: res.total ?? items.length, items };
}

/* ----------------------------- 条目 & 章节 ----------------------------- */

export async function getSubject(id: number): Promise<Subject> {
  const raw = await apiFetch<RawSubject>(`/subjects/${id}`);
  return normalizeSubject(raw);
}

/**
 * 条目详情：v0 缺中文名/简介时用 next.bgm.tv 的 p1 补齐；
 * 简介仍是日文时自动翻译成中文（翻译失败保留原文）。
 */
export async function getSubjectDetail(id: number): Promise<Subject> {
  const subject = await withChineseName(await getSubject(id));
  const { text, translated } = await toChinese(subject.summary ?? '');
  if (!translated) return subject;
  return { ...subject, summary: text, summaryTranslated: true };
}

export async function getEpisodes(subjectId: number): Promise<Episode[]> {
  const res = await apiFetch<{ data?: RawEpisode[] }>('/episodes', {
    query: { subject_id: subjectId, type: 0, limit: 200 },
    auth: false,
  });
  const eps = (res.data ?? []).map((e) => normalizeEpisode(e, subjectId));
  if (!eps.length) {
    const p1 = await fetchP1Episodes(subjectId);
    return p1.map((e) => normalizeEpisode(e, subjectId));
  }
  return mergeP1EpisodeNames(subjectId, eps);
}

/* --------------- next.bgm.tv p1 回退：中文名与分集标题 --------------- */

interface P1Episode {
  id: number;
  type?: number;
  name?: string;
  nameCN?: string;
  sort?: number;
  airdate?: string;
  comment?: number;
  duration?: string;
}

interface P1Subject {
  id: number;
  name?: string;
  nameCN?: string;
  infobox?: { key: string; values: { v: string }[] }[];
  summary?: string;
}

export async function fetchP1Subject(
  subjectId: number,
): Promise<{ nameCN: string | null; summary: string | null }> {
  const res = await p1Fetch<P1Subject>(`/subjects/${subjectId}`);
  const infoCN = res?.infobox?.find((i) => i.key === '中文名')?.values?.[0]?.v;
  return { nameCN: res?.nameCN || infoCN || null, summary: res?.summary || null };
}

export async function fetchP1Episodes(subjectId: number): Promise<RawEpisode[]> {
  const res = await p1Fetch<{ data?: P1Episode[] }>(`/subjects/${subjectId}/episodes`);
  return (res?.data ?? []).map((e) => ({
    id: e.id,
    type: e.type,
    name: e.name,
    nameCN: e.nameCN,
    sort: e.sort,
    airdate: e.airdate,
    comment: e.comment,
    duration: e.duration,
  }));
}

/** p1 补齐条目中文名（失败时返回原对象） */
export async function withChineseName(subject: Subject): Promise<Subject> {
  if (subject.nameCn) return subject;
  try {
    const { nameCN, summary } = await fetchP1Subject(subject.id);
    if (!nameCN && !summary) return subject;
    return { ...subject, nameCn: nameCN ?? subject.nameCn, summary: subject.summary || summary || undefined };
  } catch {
    return subject;
  }
}

/** p1 补齐章节中文名（任一章节缺失即整体映射一次） */
export async function mergeP1EpisodeNames(subjectId: number, episodes: Episode[]): Promise<Episode[]> {
  if (episodes.some((e) => e.nameCn)) return episodes;
  try {
    const p1 = await fetchP1Episodes(subjectId);
    const map = new Map(p1.map((e) => [e.id, e.nameCN || e.name_cn || '']));
    return episodes.map((e) => ({ ...e, nameCn: e.nameCn || map.get(e.id) || '' }));
  } catch {
    return episodes;
  }
}

/* ----------------------------- 用户收藏 ----------------------------- */

interface RawCollection {
  subject_id?: number;
  subject?: RawSubject;
  type?: number;
  rate?: number;
  ep_status?: number;
  vol_status?: number;
  comment?: string | null;
  tags?: string[];
  updated_at?: string;
}

function normalizeCollection(raw: RawCollection): CollectionItem | null {
  const subjectId = raw.subject?.id ?? raw.subject_id;
  if (!subjectId) return null;
  return {
    subjectId,
    type: (raw.type ?? 0) as CollectionType,
    rate: raw.rate ?? 0,
    epStatus: raw.ep_status ?? 0,
    volStatus: raw.vol_status ?? 0,
    comment: raw.comment ?? null,
    tags: raw.tags ?? [],
    updatedAt: raw.updated_at ? Date.parse(raw.updated_at) || 0 : 0,
    subject: raw.subject ? normalizeSubject(raw.subject) : undefined,
  };
}

export interface CollectionPage {
  items: CollectionItem[];
  total: number;
  offset: number;
}

/**
 * 拉取用户某状态的收藏（分页）。
 * 注意：api.bgm.tv 的 /users/-/collections 不接受 `-`，必须用真实 uid/username。
 */
export async function listCollections(
  user: string | number,
  type: CollectionType,
  offset = 0,
  limit = 50,
): Promise<CollectionPage> {
  const res = await apiFetch<{ data?: RawCollection[]; total?: number }>(
    `/users/${encodeURIComponent(String(user))}/collections`,
    { query: { subject_type: 2, type, limit, offset } },
  );
  const items = (res.data ?? []).map(normalizeCollection).filter((x): x is CollectionItem => !!x);
  return { items, total: res.total ?? items.length, offset };
}

/** 拉取某状态的全部收藏（按页累加，带上限保护） */
export async function listAllCollections(
  user: string | number,
  type: CollectionType,
  onPage?: (items: CollectionItem[], total: number) => void,
): Promise<CollectionItem[]> {
  const all: CollectionItem[] = [];
  const limit = 50;
  for (let offset = 0; offset < 1000; offset += limit) {
    const page = await listCollections(user, type, offset, limit);
    all.push(...page.items);
    onPage?.(all.slice(), page.total);
    if (page.items.length < limit || all.length >= page.total) break;
  }
  return all;
}

export interface CollectionPatch {
  type?: CollectionType;
  rate?: number;
  comment?: string;
  tags?: string[];
}

/**
 * 新增/修改收藏：PATCH /v0/users/-/collections/{subject_id}（type 决定状态与迁移）。
 * 注意：动画等非书籍条目不能写 ep_status / vol_status（服务端返回 400），
 * 进度只能通过单集接口推进。
 */
export async function updateCollection(subjectId: number, patch: CollectionPatch): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.rate !== undefined) body.rate = patch.rate;
  if (patch.comment !== undefined) body.comment = patch.comment;
  if (patch.tags !== undefined) body.tags = patch.tags;
  await apiFetch(`/users/-/collections/${subjectId}`, { method: 'PATCH', body });
}

/** 取消收藏 */
export async function removeCollection(subjectId: number): Promise<void> {
  await apiFetch(`/users/-/collections/${subjectId}`, { method: 'DELETE' });
}

/** 收藏最近更新时间：用于写入前的并发冲突检测 */
export async function getCollectionUpdatedAt(
  user: string | number,
  subjectId: number,
): Promise<number | null> {
  try {
    const raw = await apiFetch<{ updated_at?: string }>(
      `/users/${encodeURIComponent(String(user))}/collections/${subjectId}`,
    );
    return raw?.updated_at ? Date.parse(raw.updated_at) || null : null;
  } catch {
    return null;
  }
}


/* ----------------------------- 单集进度 ----------------------------- */

/**
 * 标记单集状态：PUT /v0/users/-/collections/-/episodes/{episode_id}
 * （该接口只接受 PUT，PATCH/POST 会返回 404）
 * type: 0 未看，1 想看，2 看过，3 抛弃
 */
export async function markEpisodeWatched(episodeId: number, type: 0 | 1 | 2 | 3 = 2): Promise<void> {
  await apiFetch(`/users/-/collections/-/episodes/${episodeId}`, {
    method: 'PUT',
    body: { type },
  });
}

export interface UserEpisodeStatus {
  episodeId: number;
  ep?: number;
  type: 0 | 1 | 2;
}

/** 查询某条目下用户的单集进度 */
export async function listUserEpisodes(subjectId: number): Promise<UserEpisodeStatus[]> {
  const res = await apiFetch<{ data?: { episode?: { id: number; ep?: number }; type?: number }[] }>(
    `/users/-/collections/${subjectId}/episodes`,
  );
  const out: UserEpisodeStatus[] = [];
  for (const row of res?.data ?? []) {
    const id = row.episode?.id;
    if (!id) continue;
    out.push({ episodeId: id, ep: row.episode?.ep, type: (row.type ?? 0) as 0 | 1 | 2 });
  }
  return out;
}

/* ----------------------------- 剧情简介与评论 ----------------------------- */

interface RawEpisodeDetail {
  id: number;
  name?: string;
  name_cn?: string;
  desc?: string;
  airdate?: string;
  duration?: string;
  comment?: number;
}

/**
 * 单集的剧情简介：v0 的 desc 字段（含脚本/分镜等信息，部分条目为空）。
 * Bangumi 不提供单集中文简介，日文原文会自动翻译成中文。
 * 失败时返回空串，不阻断界面。
 */
export async function getEpisodeDetail(
  episodeId: number,
): Promise<{ desc: string; translated: boolean }> {
  try {
    const raw = await apiFetch<RawEpisodeDetail>(`/episodes/${episodeId}`, { auth: false });
    const { text, translated } = await toChinese(raw?.desc ?? '');
    return { desc: text, translated };
  } catch {
    return { desc: '', translated: false };
  }
}

interface P1CommentUser {
  id?: number;
  username?: string;
  nickname?: string;
  avatar?: Record<string, string>;
}

interface P1SubjectComment {
  id: number;
  user?: P1CommentUser;
  rate?: number;
  comment?: string;
  updatedAt?: number;
  createdAt?: number;
}

interface P1EpisodeReply {
  id: number;
  content?: string;
  createdAt?: number;
  user?: P1CommentUser;
}

interface P1EpisodeComment {
  id: number;
  content?: string;
  createdAt?: number;
  user?: P1CommentUser;
  replies?: P1EpisodeReply[];
}

function userOf(u?: P1CommentUser): { name: string; avatar?: string } {
  return {
    name: u?.nickname || u?.username || '匿名用户',
    avatar: u?.avatar?.small || u?.avatar?.medium,
  };
}

/** 时间可能是秒或毫秒，统一成毫秒 */
function toMillis(ts?: number): number {
  if (!ts) return 0;
  return ts < 1e12 ? ts * 1000 : ts;
}

/** 条目短评：p1 接口，每页 20 条，返回总数 */
export async function fetchSubjectComments(
  subjectId: number,
  page = 1,
): Promise<CommentPage> {
  const pageSize = 20;
  const res = await p1Fetch<{ data?: P1SubjectComment[]; total?: number }>(
    `/subjects/${subjectId}/comments`,
    { page, limit: pageSize },
  );
  const items: UserComment[] = (res?.data ?? [])
    .filter((c) => (c.comment ?? '').trim().length > 0)
    .map((c) => {
      const user = userOf(c.user);
      return {
        id: c.id,
        userName: user.name,
        avatar: user.avatar,
        content: (c.comment ?? '').trim(),
        rate: c.rate ?? 0,
        createdAt: toMillis(c.updatedAt ?? c.createdAt),
      };
    });
  return { items, total: res?.total ?? items.length, page, pageSize };
}

/** 单集吐槽：p1 接口返回全量数组，不分页；在本地按时间倒序截断 */
export async function fetchEpisodeComments(episodeId: number, limit = 50): Promise<CommentPage> {
  const res = await p1Fetch<P1EpisodeComment[]>(`/episodes/${episodeId}/comments`);
  const all = Array.isArray(res) ? res : [];
  const items: UserComment[] = all
    .map((c) => {
      const user = userOf(c.user);
      const replies: CommentReply[] = (c.replies ?? [])
        .filter((r) => (r.content ?? '').trim().length > 0)
        .slice(0, 3)
        .map((r) => ({
          id: r.id,
          userName: userOf(r.user).name,
          content: (r.content ?? '').trim(),
          createdAt: toMillis(r.createdAt),
        }));
      return {
        id: c.id,
        userName: user.name,
        avatar: user.avatar,
        content: (c.content ?? '').trim(),
        rate: 0,
        createdAt: toMillis(c.createdAt),
        replies,
      };
    })
    .filter((c) => c.content.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return { items, total: all.length, page: 1, pageSize: limit };
}

/* ----------------------------- 季度索引 ----------------------------- */

export function quarterMonths(q: 1 | 2 | 3 | 4): number[] {
  return [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3];
}

/**
 * 季度索引：按月分页拉取该季度所有条目，再在本地按评分 / 热度 / 排名排序。
 * 官方接口没有「季度」概念，也不支持排序参数，只有 year/month 过滤。
 * 各月第一页并发请求，后续页按需继续，避免串行等待。
 */
export async function fetchSeasonIndex(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  sort: SeasonSort,
  type = 2,
  perMonthLimit = 200,
  /** 每拿到一批就回调一次，便于界面边下边显示 */
  onProgress?: (items: Subject[]) => void,
): Promise<Subject[]> {
  const months = quarterMonths(quarter);
  const all: Subject[] = [];

  const fetchMonth = async (month: number): Promise<void> => {
    for (let offset = 0; offset < perMonthLimit; offset += 50) {
      const res = await apiFetch<{ data?: RawSubject[] }>('/subjects', {
        query: { type, year, month, sort: 'date', limit: 50, offset },
        auth: false,
      });
      const batch = (res.data ?? []).map(normalizeSubject);
      all.push(...batch);
      onProgress?.(all.slice());
      if (batch.length < 50) break;
    }
  };

  await Promise.all(months.map((m) => fetchMonth(m).catch(() => undefined)));
  return sortSubjects(all, sort);
}

export function heatOf(s: Subject): number {
  const c = s.collection;
  if (!c) return 0;
  return c.doing + c.collect + c.wish;
}

export function sortSubjects(items: Subject[], sort: SeasonSort): Subject[] {
  const seen = new Set<number>();
  const unique = items.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  const score = (s: Subject) => s.rating?.score ?? 0;
  const rank = (s: Subject) => s.rating?.rank ?? Number.MAX_SAFE_INTEGER;
  return unique.sort((a, b) => {
    if (sort === 'heat') return heatOf(b) - heatOf(a) || score(b) - score(a);
    if (sort === 'rank') {
      const ra = a.rating?.rank || Number.MAX_SAFE_INTEGER;
      const rb = b.rating?.rank || Number.MAX_SAFE_INTEGER;
      return ra - rb || score(b) - score(a);
    }
    return score(b) - score(a) || heatOf(b) - heatOf(a);
  });
}
