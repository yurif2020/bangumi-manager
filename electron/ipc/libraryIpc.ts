import { ipcMain } from 'electron';
import type {
  CollectionItem,
  CollectionType,
  CommentPage,
  Episode,
  Subject,
  SyncState,
  WatchedResult,
} from '../shared/types';
import {
  fetchEpisodeComments,
  fetchSubjectComments,
  getEpisodeDetail,
  getEpisodes,
  getSubjectDetail,
  listAllCollections,
  listCollections,
  listUserEpisodes,
  removeCollection,
  searchSubjects,
  type CollectionPage,
  type SearchResult,
} from '../bgm/endpoints';
import { getCredentials } from '../bgm/client';
import type { SyncEngine } from '../sync/engine';

interface Deps {
  engine: SyncEngine;
}

/** 收藏接口需要真实 uid/username，`-` 会被服务端当成不存在的用户 */
function currentUser(): string | number | null {
  const cred = getCredentials();
  return cred?.userId ?? cred?.userName ?? null;
}

export function registerLibraryIpc({ engine }: Deps): void {
  ipcMain.handle('search:query', async (_e, keyword: string, offset = 0): Promise<SearchResult> => {
    const kw = String(keyword ?? '').trim();
    if (!kw) return { total: 0, items: [] };
    return searchSubjects(kw, Number(offset) || 0, 24);
  });

  ipcMain.handle('subject:get', async (_e, id: number): Promise<Subject> => getSubjectDetail(Number(id)));

  ipcMain.handle(
    'subject:episodes',
    async (_e, id: number): Promise<{ episodes: Episode[]; watched: number[]; found: boolean }> => {
      const episodes = await getEpisodes(Number(id));
      let watched: number[] = [];
      let found = false;
      try {
        const rows = await listUserEpisodes(Number(id));
        watched = rows.filter((r) => r.type === 2).map((r) => r.episodeId);
        found = true;
      } catch {
        /* 未登录或该条目没有单集记录 */
      }
      return { episodes, watched, found };
    },
  );

  ipcMain.handle('subject:comments', async (_e, id: number, page = 1): Promise<CommentPage> =>
    fetchSubjectComments(Number(id), Math.max(1, Number(page) || 1)),
  );

  ipcMain.handle('episode:detail', async (_e, id: number): Promise<{ desc: string }> =>
    getEpisodeDetail(Number(id)),
  );

  ipcMain.handle('episode:comments', async (_e, id: number): Promise<CommentPage> =>
    fetchEpisodeComments(Number(id)),
  );

  ipcMain.handle(
    'collection:list',
    async (_e, type: CollectionType, offset = 0, limit = 30): Promise<CollectionPage> => {
      const user = currentUser();
      if (!user) return { items: [] as CollectionItem[], total: 0, offset };
      return listCollections(user, type, Number(offset) || 0, Number(limit) || 30);
    },
  );

  ipcMain.handle('collection:all', async (_e, type: CollectionType): Promise<CollectionItem[]> => {
    const user = currentUser();
    if (!user) return [];
    return listAllCollections(user, type);
  });

  ipcMain.handle(
    'collection:set',
    async (
      _e,
      subjectId: number,
      type: CollectionType | 0,
      patch: { rate?: number } = {},
    ): Promise<{ ok: boolean; queued?: boolean; error?: string }> => {
      return engine.setCollection(Number(subjectId), Number(type) as CollectionType | 0, patch);
    },
  );

  ipcMain.handle('collection:remove', async (_e, subjectId: number) => {
    return engine.removeCollection(Number(subjectId));
  });

  ipcMain.handle(
    'episode:mark-watched',
    async (_e, subjectId: number, episodeId: number, ep?: number): Promise<WatchedResult> => {
      return engine.markWatchedByEpisodeId(Number(episodeId), {
        subjectId: Number(subjectId),
        ep: ep === undefined ? undefined : Number(ep),
      });
    },
  );

  ipcMain.handle('episode:unmark', async (_e, episodeId: number): Promise<WatchedResult> => {
    return engine.unmarkEpisode(Number(episodeId));
  });
}

export function registerSyncIpc({ engine }: Deps): void {
  ipcMain.handle('sync:status', (): SyncState => engine.state);
  ipcMain.handle('sync:flush', () => engine.flush());
}
