import fs from 'node:fs';
import path from 'node:path';
import { app, protocol, session } from 'electron';

/**
 * 图片缓存。
 *
 * 封面与头像都走 Bangumi 的 CDN，交给 Chromium 的 HTTP 磁盘缓存保存，
 * 这样重复浏览不会重复下载。Chromium 的缓存不区分图片和其他 HTTP 响应，
 * 也难以按访问时间淘汰，所以这里额外记录每张图片的「最近访问时间」：
 *
 * - 渲染进程通过 `image:touch` 告知某张图片被显示过；
 * - 设置页展示缓存目录大小；
 * - 超过 `IMAGE_CACHE_TTL_DAYS` 天未被访问的图片，在启动后清理一次，
 *   之后每隔几小时再看一次；
 * - 手动清理两次：只清索引（浏览器缓存保留）、清空全部（浏览器缓存也删）。
 *
 * 由于 Chromium 缓存目录无法按 URL 定点删除，这里的「过期删除」作用于
 * 我们自己的图片记录：记录被删的图片下次显示时会重新走网络，
 * 而浏览器的整体缓存由「清空全部」处理。
 */

const CACHE_DIR_NAME = 'ImageCache';
const INDEX_FILE = 'index.json';
/** 超过这么多天没有被显示的图片，下次清理时删除记录 */
export const IMAGE_CACHE_TTL_DAYS = 7;
/** 每 6 小时检查一次过期记录 */
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  /** 最近一次被显示的时间戳 */
  at: number;
  /** 该图片首次缓存时的大小（字节），用于估算 */
  size: number;
}

type CacheIndex = Record<string, CacheEntry>;

export interface ImageCacheStats {
  /** 缓存目录占用字节数 */
  bytes: number;
  /** 已记录的图片张数 */
  count: number;
  /** 过期（超过 TTL 未访问）的图片张数 */
  expired: number;
  /** 本地目录路径，便于用户排查 */
  dir: string;
  /** 过期阈值（天） */
  ttlDays: number;
}

function cacheDir(): string {
  return path.join(app.getPath('userData'), CACHE_DIR_NAME);
}

function indexPath(): string {
  return path.join(cacheDir(), INDEX_FILE);
}

function readIndex(): CacheIndex {
  try {
    const raw = fs.readFileSync(indexPath(), 'utf8');
    const parsed = JSON.parse(raw) as CacheIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeIndex(index: CacheIndex): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(indexPath(), JSON.stringify(index), 'utf8');
  } catch {
    /* 缓存索引写失败不影响主流程 */
  }
}

function isExpired(entry: CacheEntry, now = Date.now()): boolean {
  return now - entry.at > IMAGE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/** 记录图片被访问；同一张图 10 分钟内只写一次磁盘 */
const lastTouch = new Map<string, number>();
export function touchImage(url: string, size = 0): void {
  if (!/^https?:\/\//.test(url)) return;
  const now = Date.now();
  const prev = lastTouch.get(url);
  if (prev && now - prev < 10 * 60 * 1000) return;
  lastTouch.set(url, now);
  const index = readIndex();
  index[url] = { at: now, size: size || index[url]?.size || 0 };
  writeIndex(index);
}

/** 删除超过 TTL 未访问的记录，返回被删除的条数 */
export function purgeExpiredImages(): number {
  const index = readIndex();
  const now = Date.now();
  let removed = 0;
  for (const [url, entry] of Object.entries(index)) {
    if (isExpired(entry, now)) {
      delete index[url];
      removed++;
    }
  }
  if (removed > 0) writeIndex(index);
  return removed;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += await dirSize(full);
      else total += (await fs.promises.stat(full)).size;
    } catch {
      /* 文件可能在统计过程中被删除 */
    }
  }
  return total;
}

/** 统计：缓存目录大小 + 已记录张数 + 过期张数 */
export async function getImageCacheStats(): Promise<ImageCacheStats> {
  const index = readIndex();
  const values = Object.values(index);
  const bytes = await dirSize(cacheDir());
  return {
    bytes,
    count: values.length,
    expired: values.filter((e) => isExpired(e)).length,
    dir: cacheDir(),
    ttlDays: IMAGE_CACHE_TTL_DAYS,
  };
}

/** 清除过期记录（浏览器 HTTP 缓存保留），返回删除数量 */
export async function clearExpiredImageCache(): Promise<{ removed: number; stats: ImageCacheStats }> {
  const removed = purgeExpiredImages();
  return { removed, stats: await getImageCacheStats() };
}

/** 彻底清空：删除图片索引 + Chromium 的 HTTP 缓存 */
export async function clearImageCache(): Promise<ImageCacheStats> {
  lastTouch.clear();
  try {
    fs.rmSync(cacheDir(), { recursive: true, force: true });
  } catch {
    /* 目录可能不存在 */
  }
  try {
    await session.defaultSession.clearCache();
  } catch {
    /* 缓存清理失败不阻断 */
  }
  return getImageCacheStats();
}

/**
 * 启动时调用：注册自定义协议方案、清理过期记录、开启定时清理。
 * 方案注册必须在 app ready 之前完成，因此这里拆成两步。
 */
export function registerImageCacheScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'bgmimg',
      privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true },
    },
  ]);
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startImageCacheMaintenance(): void {
  const run = () => {
    try {
      purgeExpiredImages();
    } catch {
      /* 定时清理失败忽略 */
    }
  };
  // 启动后稍等片刻，避免和首屏请求抢磁盘
  setTimeout(run, 20_000);
  timer = setInterval(run, PURGE_INTERVAL_MS);
}

export function stopImageCacheMaintenance(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
