import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredCredentials {
  /** 网页登录抓到的 access_token */
  token?: string | null;
  /** 登录 Cookie（chii_auth 等）拼接成 Cookie 头 */
  cookie?: string | null;
  tokenSource?: 'web' | 'manual' | null;
  userId?: number;
  userName?: string;
  avatar?: string;
  savedAt?: number;
}

const file = () => path.join(app.getPath('userData'), 'credentials.bin');

/**
 * 凭据落盘：优先系统安全存储（Windows DPAPI / macOS Keychain），
 * 不可用时退回明文（仅存放在用户自己的 userData 目录）。
 */
export function saveCredentials(cred: StoredCredentials): void {
  const payload = JSON.stringify({ ...cred, savedAt: Date.now() });
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(file(), 'enc:' + safeStorage.encryptString(payload).toString('base64'));
      return;
    }
  } catch {
    /* 退回明文 */
  }
  fs.writeFileSync(file(), 'raw:' + payload);
}

export function loadCredentials(): StoredCredentials | null {
  try {
    const raw = fs.readFileSync(file(), 'utf8');
    if (raw.startsWith('enc:')) {
      const plain = safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'));
      return JSON.parse(plain) as StoredCredentials;
    }
    if (raw.startsWith('raw:')) return JSON.parse(raw.slice(4)) as StoredCredentials;
    return null;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(file());
  } catch {
    /* 文件不存在 */
  }
}
