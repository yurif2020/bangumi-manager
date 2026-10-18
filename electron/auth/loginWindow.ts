import { BrowserWindow, session } from 'electron';
import { extractAuthCookies, cookieHeader, hasLoginCookie } from './cookies';
import type { LoginProgress } from '../shared/types';

const LOGIN_URL = 'https://next.bgm.tv/login';

export interface WebLoginResult {
  ok: boolean;
  cookie?: string;
  token?: string | null;
  error?: string;
  cancelled?: boolean;
}

/** 从 JSON 文本里嗅探 access_token */
export function sniffTokenFromText(text: string): string | null {
  if (!text || text.length > 4_000_000) return null;
  const m = text.match(/"?access_?token"?\s*[:=]\s*"([0-9a-zA-Z._~+/=-]{20,})"/i);
  return m ? m[1] : null;
}

/** 在页面上下文中扫描 localStorage / __NEXT_DATA__ 找 token */
const TOKEN_PROBE_JS = String.raw`(() => {
  const looksLikeToken = (v) => typeof v === 'string' && v.length >= 20 && /^[0-9a-zA-Z._~+/=-]+$/.test(v);
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 5) return null;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (looksLikeToken(v) && /token/i.test(k)) return v;
      const r = walk(v, d + 1);
      if (r) return r;
    }
    return null;
  };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      const v = localStorage.getItem(k) || '';
      if (!v) continue;
      if (/token/i.test(k) && v.length >= 20) {
        if (v.startsWith('"')) { try { return JSON.parse(v); } catch (e) {} }
        if (looksLikeToken(v)) return v;
      }
      const m = v.match(/"?access_?token"?\s*[:=]\s*"([0-9a-zA-Z._~+/=-]{20,})"/i);
      if (m) return m[1];
      try {
        const parsed = JSON.parse(v);
        const found = walk(parsed, 0);
        if (found) return found;
      } catch (e) {}
    }
  } catch (e) {}
  try { if (window.__NEXT_DATA__) { const r = walk(window.__NEXT_DATA__, 0); if (r) return r; } } catch (e) {}
  // 兜底：从页面里读取 cookie 内容中的 token（部分 SPA 会把 token 塞进 cookie）
  try {
    const m = document.cookie.match(/access_?token=([^;]+)/i);
    if (m) return decodeURIComponent(m[1]);
  } catch (e) {}
  return null;
})()`;

/**
 * 打开内嵌登录窗口。用户完成网页登录后：
 *  - 从会话读取登录 Cookie（chii_auth 等）
 *  - 从页面 localStorage / __NEXT_DATA__ / 页面响应体里抓 access_token
 * 两者任一存在即视为登录成功；token 抓不到时由 Cookie 兜底调用 API。
 */
export function openWebLogin(
  onProgress?: (p: LoginProgress) => void,
  timeoutMs = 5 * 60 * 1000,
): Promise<WebLoginResult> {
  const ses = session.defaultSession;
  let capturedToken: string | null = null;

  // 登录接口的响应体里通常带着 access_token
  const onCompleted = async (details: Electron.OnCompletedListenerDetails) => {
    if (capturedToken) return;
    if (details.statusCode < 200 || details.statusCode >= 300) return;
    if (!/bgm\.tv/i.test(details.url)) return;
    if (!/login|oauth|token|me\b/i.test(details.url)) return;
    try {
      const res = await ses.fetch(details.url, { headers: { Accept: '*/*' } });
      if (!res.ok) return;
      const text = await res.text();
      const token = sniffTokenFromText(text);
      if (token) capturedToken = token;
    } catch {
      /* 响应体已失效，忽略 */
    }
  };
  ses.webRequest.onCompleted({ urls: ['https://*.bgm.tv/*'] }, onCompleted);

  return new Promise<WebLoginResult>((resolve) => {
    const win = new BrowserWindow({
      width: 560,
      height: 780,
      title: '登录 Bangumi（登录成功后窗口会自动关闭）',
      autoHideMenuBar: true,
      backgroundColor: '#f7f7f8',
      parent: undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    let finished = false;
    const poll = setInterval(() => void tick(), 1200);
    const timeout = setTimeout(() => void finish('timeout'), timeoutMs);

    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timeout);
      ses.webRequest.onCompleted(null as unknown as () => void);
    };

    async function probeToken(): Promise<string | null> {
      if (capturedToken || win.isDestroyed()) return capturedToken;
      try {
        const v = await win.webContents.executeJavaScript(TOKEN_PROBE_JS, true);
        if (typeof v === 'string' && v.length >= 20) capturedToken = v;
      } catch {
        /* 页面跳转中 */
      }
      return capturedToken;
    }

    async function finish(kind: 'ok' | 'cancel' | 'timeout'): Promise<void> {
      if (finished) return;
      finished = true;
      cleanup();

      if (kind === 'cancel') {
        onProgress?.({ phase: 'cancelled' });
        resolve({ ok: false, cancelled: true, error: '已取消登录' });
        return;
      }

      const cookies = await extractAuthCookies(ses);
      const token = await probeToken();
      if (!hasLoginCookie(cookies) && !token) {
        const error = kind === 'timeout' ? '登录超时，请重新登录' : '未检测到登录状态';
        onProgress?.({ phase: 'failed', message: error });
        resolve({ ok: false, error });
        if (!win.isDestroyed()) win.close();
        return;
      }
      onProgress?.({ phase: 'verifying' });
      const cookie = cookieHeader(cookies);
      resolve({ ok: true, cookie, token });
      if (!win.isDestroyed()) win.close();
    }

    async function tick(): Promise<void> {
      if (finished || win.isDestroyed()) return;
      const cookies = await extractAuthCookies(ses);
      if (!hasLoginCookie(cookies)) return;
      onProgress?.({ phase: 'waiting', message: '检测到登录，正在读取凭据…' });
      clearInterval(poll);
      // 留一点时间让 SPA 把 token 写进 localStorage
      setTimeout(() => void finish('ok'), 1500);
    }

    win.webContents.on('did-navigate', () => void probeToken());
    win.webContents.on('did-finish-load', () => void probeToken());
    win.on('closed', () => void finish('cancel'));
    onProgress?.({ phase: 'opened' });

    void win.loadURL(LOGIN_URL).catch(() => {
      /* 网络失败由超时兜底 */
    });
    void probeToken();
  });
}
