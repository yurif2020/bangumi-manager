import type { Session } from 'electron';

/** 与登录态相关的 Cookie 名（bgm.tv 与 next.bgm.tv 共用 chii_auth） */
export const AUTH_COOKIE_NAMES = ['chii_auth', 'chii_sid', 'chii_sec'] as const;

export interface AuthCookie {
  name: string;
  value: string;
  domain: string;
}

const AUTH_DOMAINS = ['bgm.tv', 'next.bgm.tv', 'api.bgm.tv'];

/** 从会话中提取登录 Cookie */
export async function extractAuthCookies(ses: Session): Promise<AuthCookie[]> {
  const all = await ses.cookies.get({});
  const wanted = new Set<string>(AUTH_COOKIE_NAMES);
  return all
    .filter((c) => {
      const domain = (c.domain ?? '').replace(/^\./, '');
      return wanted.has(c.name) && !!c.value && AUTH_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
    })
    .map((c) => ({ name: c.name, value: c.value, domain: c.domain ?? '' }));
}

/** chii_auth 即可代表网页已登录 */
export function hasLoginCookie(cookies: AuthCookie[]): boolean {
  return cookies.some((c) => c.name === 'chii_auth' && c.value.length > 10);
}

export function cookieHeader(cookies: AuthCookie[]): string {
  // 同名 cookie 以短域名（bgm.tv 主域）优先
  const map = new Map<string, string>();
  for (const c of [...cookies].sort((a, b) => b.domain.length - a.domain.length)) {
    map.set(c.name, c.value);
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
