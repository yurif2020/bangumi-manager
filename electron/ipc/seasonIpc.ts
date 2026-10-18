import { BrowserWindow, ipcMain } from 'electron';
import type { ImageCacheStats, SeasonSort, Subject } from '../shared/types';
import {
  clearExpiredImageCache,
  clearImageCache,
  getImageCacheStats,
  touchImage,
} from '../cache/imageCache';
import { cachedSeason, clearSeasonCache, refreshSeason, seasonCacheBytes } from '../cache/seasonCache';

export interface SeasonPayload {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  sort: SeasonSort;
  items: Subject[];
  /** 数据来源：缓存命中 / 网络 */
  source: 'cache' | 'network';
  /** 本次网络抓取已完成的批次比例 0..1 */
  progress: number;
  /** 是否已是最新（缓存命中且未过期，或网络抓取完成） */
  done: boolean;
  /** 缓存写入时间 */
  cachedAt?: number;
}

const inflight = new Map<string, Promise<void>>();

function push(payload: SeasonPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('season:update', payload);
  }
}

export function registerSeasonIpc(): void {
  ipcMain.handle(
    'season:list',
    async (_e, year: number, quarter: 1 | 2 | 3 | 4, sort: SeasonSort, type = 2): Promise<SeasonPayload> => {
      const y = Number(year) || new Date().getFullYear();
      const q = ([1, 2, 3, 4] as const).includes(quarter) ? quarter : 1;
      const t = [1, 2, 4, 6].includes(Number(type)) ? Number(type) : 2;
      const s: SeasonSort = ['score', 'heat', 'rank'].includes(sort) ? sort : 'score';
      const base = { year: y, quarter: q, sort: s };

      // 1. 有缓存先给缓存
      const hit = cachedSeason(y, q, t, s);
      if (hit) {
        const payload: SeasonPayload = {
          ...base,
          items: hit.items,
          source: 'cache',
          progress: 1,
          done: hit.fresh,
          cachedAt: hit.at,
        };
        // 2. 缓存过期就在后台刷新，边抓边推
        if (!hit.fresh) void refreshInBackground(y, q, t, s);
        return payload;
      }

      // 3. 无缓存：抓取过程中推送进度，首个响应也带一批
      return fetchWithProgress(y, q, t, s);
    },
  );
}

function key(year: number, quarter: number, type: number): string {
  return `${year}-${quarter}-${type}`;
}

async function refreshInBackground(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  type: number,
  sort: SeasonSort,
): Promise<void> {
  const k = key(year, quarter, type);
  if (inflight.has(k)) return;
  const task = refreshSeason(year, quarter, type, sort, (items, done) => {
    push({
      year,
      quarter,
      sort,
      items,
      source: 'network',
      progress: done ? 1 : 0.5,
      done,
    });
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => inflight.delete(k));
  inflight.set(k, task);
}

async function fetchWithProgress(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  type: number,
  sort: SeasonSort,
): Promise<SeasonPayload> {
  let latest: Subject[] = [];
  const k = key(year, quarter, type);
  const task = refreshSeason(year, quarter, type, sort, (items, done) => {
    latest = items;
    if (!done) {
      push({ year, quarter, sort, items, source: 'network', progress: 0.4, done: false });
    }
  });
  inflight.set(k, task.then(() => undefined).finally(() => inflight.delete(k)));
  const items = await task.catch(() => latest);
  return { year, quarter, sort, items, source: 'network', progress: 1, done: true };
}

/** 图片缓存：统计、清理、访问记录 */
export function registerCacheIpc(): void {
  ipcMain.handle('cache:stats', async (): Promise<ImageCacheStats> => {
    const stats = await getImageCacheStats();
    return { ...stats, seasonBytes: seasonCacheBytes() };
  });

  ipcMain.handle('cache:clear-expired', async () => clearExpiredImageCache());

  ipcMain.handle('cache:clear-all', async (): Promise<ImageCacheStats> => {
    clearSeasonCache();
    const stats = await clearImageCache();
    return { ...stats, seasonBytes: 0 };
  });

  // 渲染进程每显示一张图就上报一次（主进程内部有节流）
  ipcMain.on('cache:touch', (_e, url: string, size: number) => {
    if (typeof url === 'string' && url.startsWith('http')) touchImage(url, Number(size) || 0);
  });
}
