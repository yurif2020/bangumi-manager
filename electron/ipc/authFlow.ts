import type { LoginResult, Settings } from '../shared/types';
import { commitCredentials } from '../bgm/commit';
import { getCredentials, isLoggedIn } from '../bgm/client';
import { verifyIdentity } from '../auth/identity';
import { openWebLogin } from '../auth/loginWindow';
import { patchSettings, toPublicSettings } from '../store/settings';

export function publicSettings(): Settings {
  const cred = getCredentials();
  return toPublicSettings({
    loggedIn: isLoggedIn(),
    userName: cred?.userName,
    userId: cred?.userId,
    avatar: cred?.avatar,
    tokenSource: cred?.tokenSource ?? null,
  });
}

/** 网页登录：内嵌窗口登录后同时拿到 Cookie 与页面 token */
export async function loginViaWeb(): Promise<LoginResult> {
  const result = await openWebLogin();
  if (!result.ok) return { ok: false, error: result.error };
  try {
    const identity = await verifyIdentity({ token: result.token, cookie: result.cookie });
    commitCredentials(
      { token: result.token, cookie: result.cookie, tokenSource: result.token ? 'web' : null },
      identity,
    );
    return { ok: true, userId: identity.userId, userName: identity.userName, avatar: identity.avatar };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 手动粘贴 Access Token（备用登录方式） */
export async function loginViaToken(token: string): Promise<LoginResult> {
  const trimmed = token.trim();
  if (trimmed.length < 10) return { ok: false, error: 'Token 格式不正确' };
  try {
    const identity = await verifyIdentity({ token: trimmed });
    commitCredentials(
      { token: trimmed, cookie: getCredentials()?.cookie ?? null, tokenSource: 'manual' },
      identity,
    );
    return { ok: true, userId: identity.userId, userName: identity.userName, avatar: identity.avatar };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function logout(): Settings {
  commitCredentials({ token: null, cookie: null, tokenSource: null });
  return publicSettings();
}

export function saveSettings(patch: Partial<Settings>): Settings {
  patchSettings(patch);
  return publicSettings();
}
