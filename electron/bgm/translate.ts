import { session } from 'electron';

/**
 * 简介翻译（免 token）。
 *
 * Bangumi 的简介（条目 summary / 单集 desc）常常是日文原文，而条目中文名、单集中文标题都有。
 * 这里把非中文简介翻译成中文，供详情页展示。
 *
 * 数据源（都不需要 token / API key）：
 *   1. Google 免费单段翻译 translate_a/single?client=gtx
 *   2. MyMemory 开放接口（备用，Google 不可达时使用）
 * 结果在内存里做 LRU 缓存，同一条目/单集在一次运行期间只翻译一次。
 * 全部失败时返回 null，调用方回退原文——翻译不可用不能影响主流程。
 */

const GOOGLE = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY = 'https://api.mymemory.translated.net/get';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) bgm-manager/0.1';
const CACHE_LIMIT = 300;
/** 单次请求的正文上限，过长内容截断翻译，避免请求被拒 */
const MAX_CHARS = 4000;

const cache = new Map<string, string>();

/** 假名占比足够高才认为是日文 */
export function looksJapanese(text: string): boolean {
  if (!text.trim()) return false;
  const kana = (text.match(/[\u3040-\u30ff]/g) ?? []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (kana === 0) return false;
  return kana / Math.max(1, kana + cjk) >= 0.15;
}

/** 已是中文：汉字足够多且没有假名 */
export function looksChinese(text: string): boolean {
  if (!text.trim()) return false;
  const kana = (text.match(/[\u3040-\u30ff]/g) ?? []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return kana === 0 && cjk >= 8;
}

/** 是否需要翻译：日文，或明显的英文长文 */
export function needsTranslation(text: string): boolean {
  if (!text.trim()) return false;
  if (looksChinese(text)) return false;
  return looksJapanese(text) || /[A-Za-z]{12,}/.test(text);
}

function remember(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await session.defaultSession.fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Google gtx：返回 [[[译文, 原文, ...], ...], ...] */
async function viaGoogle(text: string): Promise<string | null> {
  const url = `${GOOGLE}?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
  const json = await getJson<unknown[][]>(url);
  const segments = Array.isArray(json?.[0]) ? (json[0] as unknown as string[][]) : [];
  const out = segments
    .map((seg) => (Array.isArray(seg) ? seg[0] ?? '' : ''))
    .join('')
    .trim();
  return out || null;
}

/** MyMemory（备用）：q ≤ 500 字符 */
async function viaMyMemory(text: string): Promise<string | null> {
  const chunk = text.slice(0, 480);
  const url = `${MYMEMORY}?q=${encodeURIComponent(chunk)}&langpair=ja|zh-CN`;
  const json = await getJson<{ responseData?: { translatedText?: string }; responseStatus?: number | string }>(url);
  const out = json?.responseData?.translatedText?.trim();
  if (!out) return null;
  // MyMemory 额度用尽时会返回提示语而不是译文
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) return null;
  return out;
}

/** 翻译成中文；全部数据源失败时返回 null */
export async function translateToChinese(text: string): Promise<string | null> {
  const src = text.trim();
  if (!src) return null;
  const cached = cache.get(src);
  if (cached) return cached;

  const input = src.length > MAX_CHARS ? src.slice(0, MAX_CHARS) : src;
  const out = (await viaGoogle(input)) ?? (await viaMyMemory(input));
  if (!out) return null;
  remember(src, out);
  return out;
}

/** 把一段简介规范成中文：已是中文原样返回，否则尝试翻译（失败回退原文） */
export async function toChinese(text: string): Promise<{ text: string; translated: boolean }> {
  const src = text.trim();
  if (!src) return { text: '', translated: false };
  if (!needsTranslation(src)) return { text: src, translated: false };
  const zh = await translateToChinese(src);
  return zh ? { text: zh, translated: true } : { text: src, translated: false };
}
