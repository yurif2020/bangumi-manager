/**
 * 主进程与渲染层共享的类型定义。
 * 渲染层只能访问这里列出的结构（通过 preload 暴露的 window.api）。
 */

export type CollectionType = 1 | 2 | 3 | 4 | 5;

export const COLLECTION_LABELS: Record<CollectionType, string> = {
  1: '想看',
  2: '看过',
  3: '在看',
  4: '搁置',
  5: '抛弃',
};

export const COLLECTION_ORDER: CollectionType[] = [3, 1, 2, 4, 5];

export interface SubjectImages {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export interface SubjectRating {
  score: number;
  total: number;
  rank?: number;
}

export interface Subject {
  id: number;
  name: string;
  nameCn: string;
  summary?: string;
  /** 简介是否经过机器翻译（原文为日文等） */
  summaryTranslated?: boolean;
  date?: string;
  airWeekday?: number;
  eps?: number;
  totalEpisodes?: number;
  platform?: string;
  rating?: SubjectRating;
  images?: SubjectImages;
  type?: number;
  tags?: { name: string; count: number }[];
  collection?: { wish: number; collect: number; doing: number; onHold: number; dropped: number };
}

export interface Episode {
  id: number;
  /** 0 本篇，1 SP，2 OP，3 ED 等 */
  type: number;
  name: string;
  nameCn: string;
  sort: number;
  airdate?: string;
  comment?: number;
  duration?: string;
  ep?: number | null;
  subjectId?: number;
  /** 剧情简介（部分条目没有） */
  desc?: string;
}

/** 一条用户评论：条目短评或单集吐槽 */
export interface UserComment {
  id: number;
  /** 用户名（昵称） */
  userName: string;
  avatar?: string;
  /** 评论正文 */
  content: string;
  /** 评分 0–10，单集评论为 0 */
  rate: number;
  /** 发表时间（毫秒时间戳） */
  createdAt: number;
  /** 单集评论的回复（最多保留前若干条） */
  replies?: CommentReply[];
}

export interface CommentReply {
  id: number;
  userName: string;
  content: string;
  createdAt: number;
}

export interface CommentPage {
  items: UserComment[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CollectionItem {
  subjectId: number;
  type: CollectionType;
  rate: number;
  epStatus: number;
  volStatus: number;
  comment?: string | null;
  tags?: string[];
  updatedAt: number;
  subject?: Subject;
}

export type ProxyMode = 'system' | 'direct' | 'manual' | 'directPlus';

export type ThemeMode = 'dark' | 'light';

/** 强调色主题：只影响按钮、选中态、进度条等强调元素 */
export type AccentColor = 'pink' | 'blue' | 'green' | 'purple' | 'orange' | 'teal';

/** 图片缓存统计，供设置页展示 */
export interface ImageCacheStats {
  /** 缓存目录占用字节数 */
  bytes: number;
  /** 已记录的图片张数 */
  count: number;
  /** 超过保留期未访问的张数 */
  expired: number;
  /** 本地目录路径 */
  dir: string;
  /** 保留天数 */
  ttlDays: number;
  /** 季度索引缓存占用字节数 */
  seasonBytes?: number;
}

export interface Settings {
  proxyMode: ProxyMode;
  /** 直连增强：开启 DoH + ECH，绕过 DNS 污染（默认开启） */
  directDns: boolean;
  proxyRules: string;
  refreshMinutes: number;
  theme: ThemeMode;
  accent: AccentColor;
  closeToTray: boolean;
  launchAtLogin: boolean;
  userName?: string;
  userId?: number;
  avatar?: string;
  /** 是否已保存凭据（不返回凭据本身） */
  loggedIn: boolean;
  tokenSource?: 'web' | 'manual' | null;
  seasonYear: number;
  seasonQuarter: 1 | 2 | 3 | 4;
  seasonSort: SeasonSort;
}

export type SeasonSort = 'score' | 'heat' | 'rank';

export interface LoginResult {
  ok: boolean;
  userId?: number;
  userName?: string;
  avatar?: string;
  error?: string;
}

export interface LoginProgress {
  phase: 'opened' | 'waiting' | 'verifying' | 'done' | 'failed' | 'cancelled';
  message?: string;
}

export type WatchedEventSource = 'url' | 'cli' | 'ui';

export interface WatchedEvent {
  subjectId?: number;
  episodeId?: number;
  /** 集数（1 起），缺省表示「推进下一集」 */
  ep?: number;
  at: number;
  source: WatchedEventSource;
}

export interface SyncState {
  syncing: boolean;
  lastSyncAt: number | null;
  queueSize: number;
  error?: string | null;
}

export interface ProxyStatus {
  mode: ProxyMode;
  rules: string;
  resolved: string;
}

export interface WatchedResult {
  ok: boolean;
  subjectId?: number;
  episodeId?: number;
  ep?: number;
  queued?: boolean;
  error?: string;
}

export interface Result<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
