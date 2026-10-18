import { ipcMain, BrowserWindow, shell } from 'electron';
import type { LoginResult, LoginProgress, Settings } from '../shared/types';
import { loginViaToken, loginViaWeb, logout, publicSettings, saveSettings } from './authFlow';
import { applyProxy, resolveProxySample } from '../store/proxy';
import { isLoggedIn } from '../bgm/client';
import { broadcastToast } from './events';

export function registerAuthIpc(): void {
  ipcMain.handle('settings:get', () => publicSettings());

  ipcMain.handle('settings:save', async (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    if ('proxyMode' in patch || 'proxyRules' in patch) await applyProxy();
    return next;
  });

  ipcMain.handle('auth:login-web', async (e): Promise<LoginResult> => {
    const win = BrowserWindow.fromWebContents(e.sender);
    // 登录期间把主窗口留在原地，只靠提示条反馈进度
    win?.webContents.send('login:progress', { phase: 'opened' } satisfies LoginProgress);
    const res = await loginViaWeb();
    win?.webContents.send(
      'login:progress',
      (res.ok
        ? { phase: 'done', message: res.userName }
        : { phase: 'failed', message: res.error }) satisfies LoginProgress,
    );
    if (res.ok) broadcastToast('success', `已登录：${res.userName ?? ''}`);
    return res;
  });

  ipcMain.handle('auth:login-token', async (_e, token: string): Promise<LoginResult> => {
    if (typeof token !== 'string' || !token.trim()) return { ok: false, error: 'Token 不能为空' };
    return loginViaToken(token);
  });

  ipcMain.handle('auth:logout', () => logout());

  ipcMain.handle('auth:status', () => ({
    loggedIn: isLoggedIn(),
    settings: publicSettings(),
  }));

  ipcMain.handle('proxy:test', async () => resolveProxySample());
  ipcMain.handle('proxy:apply', async () => applyProxy());

  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url);
  });
}
