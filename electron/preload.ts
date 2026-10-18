import { contextBridge, ipcRenderer } from 'electron';
import type {
  CollectionItem,
  CollectionType,
  CommentPage,
  Episode,
  ImageCacheStats,
  LoginProgress,
  LoginResult,
  Settings,
  Subject,
  SyncState,
  WatchedEvent,
  WatchedResult,
} from './shared/types';

export interface EpisodeBundle {
  episodes: Episode[];
  watched: number[];
  found: boolean;
}

export interface CollectionPage {
  items: CollectionItem[];
  total: number;
  offset: number;
}

/** 季度索引一次推送的数据 */
export interface SeasonPayload {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  sort: 'score' | 'heat' | 'rank';
  items: Subject[];
  source: 'cache' | 'network';
  progress: number;
  done: boolean;
  cachedAt?: number;
}

export interface SearchResponse {
  total: number;
  items: Subject[];
}

export interface CollectionWriteResult {
  ok: boolean;
  queued?: boolean;
  error?: string;
}

const api = {
  ping: () => ipcRenderer.invoke('app:ping') as Promise<string>,

  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    save: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:save', patch) as Promise<Settings>,
  },

  auth: {
    loginWeb: () => ipcRenderer.invoke('auth:login-web') as Promise<LoginResult>,
    loginToken: (token: string) => ipcRenderer.invoke('auth:login-token', token) as Promise<LoginResult>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<Settings>,
    status: () => ipcRenderer.invoke('auth:status') as Promise<{ loggedIn: boolean; settings: Settings }>,
  },

  proxy: {
    test: () => ipcRenderer.invoke('proxy:test') as Promise<string>,
    apply: () => ipcRenderer.invoke('proxy:apply') as Promise<{ mode: string; resolved: string }>,
  },

  search: {
    query: (keyword: string, offset = 0) =>
      ipcRenderer.invoke('search:query', keyword, offset) as Promise<SearchResponse>,
  },

  subject: {
    get: (id: number) => ipcRenderer.invoke('subject:get', id) as Promise<Subject>,
    episodes: (id: number) => ipcRenderer.invoke('subject:episodes', id) as Promise<EpisodeBundle>,
    comments: (id: number, page = 1) =>
      ipcRenderer.invoke('subject:comments', id, page) as Promise<CommentPage>,
  },

  collection: {
    list: (type: CollectionType, offset = 0, limit = 30) =>
      ipcRenderer.invoke('collection:list', type, offset, limit) as Promise<CollectionPage>,
    all: (type: CollectionType) => ipcRenderer.invoke('collection:all', type) as Promise<CollectionItem[]>,
    set: (subjectId: number, type: CollectionType | 0, patch?: { rate?: number }) =>
      ipcRenderer.invoke('collection:set', subjectId, type, patch ?? {}) as Promise<CollectionWriteResult>,
    remove: (subjectId: number) =>
      ipcRenderer.invoke('collection:remove', subjectId) as Promise<CollectionWriteResult>,
  },

  season: {
    list: (year: number, quarter: 1 | 2 | 3 | 4, sort: 'score' | 'heat' | 'rank', type = 2) =>
      ipcRenderer.invoke('season:list', year, quarter, sort, type) as Promise<SeasonPayload>,
  },

  episode: {
    markWatched: (subjectId: number, episodeId: number, ep?: number) =>
      ipcRenderer.invoke('episode:mark-watched', subjectId, episodeId, ep) as Promise<WatchedResult>,
    unmark: (episodeId: number) => ipcRenderer.invoke('episode:unmark', episodeId) as Promise<WatchedResult>,
    detail: (episodeId: number) =>
      ipcRenderer.invoke('episode:detail', episodeId) as Promise<{ desc: string; translated: boolean }>,
    comments: (episodeId: number) =>
      ipcRenderer.invoke('episode:comments', episodeId) as Promise<CommentPage>,
  },

  cache: {
    stats: () => ipcRenderer.invoke('cache:stats') as Promise<ImageCacheStats>,
    clearExpired: () =>
      ipcRenderer.invoke('cache:clear-expired') as Promise<{ removed: number; stats: ImageCacheStats }>,
    clearAll: () => ipcRenderer.invoke('cache:clear-all') as Promise<ImageCacheStats>,
    touch: (url: string, size?: number) => ipcRenderer.send('cache:touch', url, size ?? 0),
  },

  sync: {
    status: () => ipcRenderer.invoke('sync:status') as Promise<SyncState>,
    flush: () =>
      ipcRenderer.invoke('sync:flush') as Promise<{ done: number; pending: number; errors: string[] }>,
  },

  on: {
    seasonUpdate: (cb: (p: SeasonPayload) => void) => {
      const listener = (_e: unknown, p: SeasonPayload) => cb(p);
      ipcRenderer.on('season:update', listener);
      return () => ipcRenderer.removeListener('season:update', listener);
    },
    watchedIncoming: (cb: (ev: WatchedEvent) => void) => {
      const listener = (_e: unknown, ev: WatchedEvent) => cb(ev);
      ipcRenderer.on('watched:incoming', listener);
      return () => ipcRenderer.removeListener('watched:incoming', listener);
    },
    syncChanged: (cb: (state: SyncState) => void) => {
      const listener = (_e: unknown, state: SyncState) => cb(state);
      ipcRenderer.on('sync:changed', listener);
      return () => ipcRenderer.removeListener('sync:changed', listener);
    },
    refreshRequested: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('app:refresh', listener);
      return () => ipcRenderer.removeListener('app:refresh', listener);
    },
    toast: (cb: (msg: { kind: 'info' | 'error' | 'success'; text: string }) => void) => {
      const listener = (_e: unknown, msg: { kind: 'info' | 'error' | 'success'; text: string }) => cb(msg);
      ipcRenderer.on('app:toast', listener);
      return () => ipcRenderer.removeListener('app:toast', listener);
    },
    loginProgress: (cb: (p: LoginProgress) => void) => {
      const listener = (_e: unknown, p: LoginProgress) => cb(p);
      ipcRenderer.on('login:progress', listener);
      return () => ipcRenderer.removeListener('login:progress', listener);
    },
  },

  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url) as Promise<void>,
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
