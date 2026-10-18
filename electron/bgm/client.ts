import { session } from 'electron';
import { clearCredentials, loadCredentials, saveCredentials, type StoredCredentials } from '../auth/credentials';

export const API_BASE = 'https://api.bgm.tv/v0';
export const P1_BASE = 'https://next.bgm.tv/p1';
export const UA = 'bgm-manager/0.1 (https://github.com/local/bgm-manager)';

let cached: StoredCredentials | null | undefined;

export function getCredentials(): StoredCredentials | null {
  if (cached === undefined) cached = loadCredentials();
  return cached;
}

export function setCredentials(next: StoredCredentials | null): void {
  cached = next;
  if (next) saveCredentials(next);
  else clearCredentials();
}

export function isLoggedIn(): boolean {
  const c = getCredentials();
  return !!c && (!!c.token || !!c.cookie);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** 是否需要登录凭据，默认 true */
  auth?: boolean;
  timeoutMs?: number;
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(base + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** 用 Electron 会话发起请求，自动走已应用的代理设置 */
async function rawFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await session.defaultSession.fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 单个请求尝试：429/5xx 重试一次，401/403 抛可识别的 ApiError */
async function attempt(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  for (let retry = 0; ; retry++) {
    const res = await rawFetch(
      url,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      timeoutMs,
    );
    if (res.status === 429) {
      if (retry >= 1) throw new ApiError(429, '请求过于频繁，请稍后再试');
      const wait = Number(res.headers.get('retry-after') ?? 1) * 1000 || 1000;
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(res.status, '登录已失效，请在设置中重新登录');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = text.slice(0, 200);
      try {
        const parsed = JSON.parse(text) as { description?: string; message?: string };
        detail = parsed.description || parsed.message || detail;
      } catch {
        /* 非 JSON 错误体 */
      }
      if (res.status >= 500 && retry < 1) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw new ApiError(res.status, `请求失败（${res.status}）${detail ? `：${detail}` : ''}`);
    }
    if (res.status === 204) return undefined;
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  }
}

/**
 * 统一请求：优先 Access Token；401/403 时回退登录 Cookie。
 * 两种凭据都失效时抛出 401 ApiError，由上层提示重新登录。
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, timeoutMs = 20000 } = opts;
  const cred = getCredentials();

  const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const modes: Array<{ auth?: string; cookie?: string }> = [];
  if (!auth) {
    modes.push({});
  } else {
    if (cred?.token) modes.push({ auth: `Bearer ${cred.token}` });
    if (cred?.cookie) modes.push({ cookie: cred.cookie });
    if (!modes.length) throw new ApiError(401, '尚未登录，请先在设置中登录 Bangumi');
  }

  const url = buildUrl(API_BASE, path, query);
  let lastError: unknown;
  for (const mode of modes) {
    const h = { ...headers };
    if (mode.auth) h.Authorization = mode.auth;
    if (mode.cookie) h.Cookie = mode.cookie;
    try {
      return (await attempt(url, method, h, body, timeoutMs)) as T;
    } catch (err) {
      lastError = err;
      // 凭据问题换下一种；其余错误直接失败
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 请求 next.bgm.tv 的 p1 接口（中文名与分集标题回退） */
export async function p1Fetch<T>(path: string, query?: RequestOptions['query']): Promise<T> {
  const url = buildUrl(P1_BASE, path, query);
  const cred = getCredentials();
  const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' };
  if (cred?.token) headers.Authorization = `Bearer ${cred.token}`;
  if (cred?.cookie) headers.Cookie = cred.cookie;
  return (await attempt(url, 'GET', headers, undefined, 12000)) as T;
}
