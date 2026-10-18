import type { Identity } from '../auth/identity-types';
import type { StoredCredentials } from '../auth/credentials';
import { setCredentials } from './client';

/** 登录凭据落库（网页登录 / 手动 Token 共用），并把身份信息一并缓存 */
export function commitCredentials(next: StoredCredentials, identity?: Identity): Identity {
  const merged: StoredCredentials = {
    token: next.token ?? null,
    cookie: next.cookie ?? null,
    tokenSource: next.tokenSource ?? null,
    userId: identity?.userId ?? next.userId,
    userName: identity?.userName ?? next.userName,
    avatar: identity?.avatar ?? next.avatar,
  };
  setCredentials(merged);
  return (
    identity ?? {
      userId: merged.userId ?? 0,
      userName: merged.userName ?? '',
      avatar: merged.avatar,
    }
  );
}
