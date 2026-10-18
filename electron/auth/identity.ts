import { session } from 'electron';
import type { Identity } from './identity-types';
import { UA } from '../bgm/client';

interface MeResponse {
  id: number;
  username: string;
  nickname?: string;
  avatar?: { large?: string; medium?: string; small?: string };
}

/**
 * 用凭据请求 /v0/me 校验身份。
 * 优先 Access Token（Authorization: Bearer），其次登录 Cookie。
 */
export async function verifyIdentity(auth: {
  token?: string | null;
  cookie?: string | null;
}): Promise<Identity> {
  const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.cookie) headers.Cookie = auth.cookie;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await session.defaultSession.fetch('https://api.bgm.tv/v0/me', {
      headers,
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) throw new Error('凭据无效或已过期');
    if (!res.ok) throw new Error(`校验登录失败（HTTP ${res.status}）`);
    const me = (await res.json()) as MeResponse;
    if (!me?.id) throw new Error('响应缺少用户信息');
    return {
      userId: me.id,
      userName: me.nickname || me.username,
      avatar: me.avatar?.large || me.avatar?.medium,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('校验登录超时，请检查网络或代理');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type { Identity };
