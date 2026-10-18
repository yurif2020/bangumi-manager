import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { Subject } from '../shared/types';
import { fetchSeasonIndex, sortSubjects } from '../bgm/endpoints';
import type { SeasonSort } from '../shared/types';

/**
 * 季度索引缓存。
 *
 * 一个季度要拉十几次请求、耗时数秒。这里把整季条目落盘：
 * 同一季度 {year, quarter, type} 只存一份（三种排序共用，排序在内存里做）。
 *
 * - 有缓存：立刻返回，再在后台刷新（stale-while-revalidate）
 * - 无缓存：边拉边推，渲染层拿到第一批就能先画出来
 * - 超过 SEASON_TTL_MS 的缓存视为过期，后台刷新结束后覆盖
 * - 过期太多的文件在启动维护时删除
 */

const DIR_NAME = 'SeasonCache';
/** 缓存多久后视为过期（需要后台刷新） */
export const SEASON_TTL_MS = 24 * 60 * 60 * 1000;
/** 超过这么久没更新过的文件直接删掉 */
const SEASON_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface SeasonFile {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  type: number;
  /** 上次完整抓取时间 */
  at: number;
  items: Subject[];
}

function dir(): string {
  return path.join(app.getPath('userData'), DIR_NAME);
}

function fileOf(year: number, quarter: number, type: number): string {
  return path.join(dir(), `q-${year}-${quarter}-t${type}.json`);
}

export function readSeasonCache(year: number, quarter: 1 | 2 | 3 | 4, type: number): SeasonFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(fileOf(year, quarter, type), 'utf8')) as SeasonFile;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSeasonCache(year: number, quarter: 1 | 2 | 3 | 4, type: number, items: Subject[]): void {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const payload: SeasonFile = { year, quarter, type, at: Date.now(), items };
    fs.writeFileSync(fileOf(year, quarter, type), JSON.stringify(payload));
  } catch {
    /* 缓存写失败不影响展示 */
  }
}

/** 按排序返回缓存内容；isFresh 表示是否还在有效期内 */
export function cachedSeason(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  type: number,
  sort: SeasonSort,
): { items: Subject[]; at: number; fresh: boolean } | null {
  const file = readSeasonCache(year, quarter, type);
  if (!file) return null;
  return {
    items: sortSubjects(file.items, sort),
    at: file.at,
    fresh: Date.now() - file.at < SEASON_TTL_MS,
  };
}

/**
 * 抓取整季后写缓存，抓到多少就通过 onPartial 推多少（按 sort 排好序）。
 * 没有任何数据时不覆盖旧缓存。
 */
export async function refreshSeason(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  type: number,
  sort: SeasonSort,
  onPartial?: (items: Subject[], done: boolean) => void,
): Promise<Subject[]> {
  const items = await fetchSeasonIndex(year, quarter, sort, type, 200, (partial) =>
    onPartial?.(sortSubjects(partial, sort), false),
  );
  if (items.length) writeSeasonCache(year, quarter, type, items);
  onPartial?.(items, true);
  return items;
}

/** 删除过期太久的缓存文件 */
export function purgeSeasonCache(): number {
  let removed = 0;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir()).filter((f) => f.endsWith('.json'));
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const file of files) {
    const full = path.join(dir(), file);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8')) as SeasonFile;
      if (!data.at || now - data.at > SEASON_MAX_AGE_MS) {
        fs.rmSync(full, { force: true });
        removed++;
      }
    } catch {
      fs.rmSync(full, { force: true });
      removed++;
    }
  }
  return removed;
}

/** 缓存目录占用字节数（设置页展示用） */
export function seasonCacheBytes(): number {
  try {
    return fs
      .readdirSync(dir())
      .reduce((sum, f) => sum + (fs.statSync(path.join(dir(), f)).size || 0), 0);
  } catch {
    return 0;
  }
}

/** 清空季度缓存 */
export function clearSeasonCache(): void {
  try {
    fs.rmSync(dir(), { recursive: true, force: true });
  } catch {
    /* 目录不存在 */
  }
}
