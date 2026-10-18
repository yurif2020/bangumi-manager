import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { parseIngestArgs } from './parse';
import type { WatchedEvent } from '../shared/types';

let mainWindow: () => BrowserWindow | null = () => null;
let handler: ((ev: WatchedEvent) => Promise<unknown>) | null = null;

export function setIngestWindow(getter: () => BrowserWindow | null): void {
  mainWindow = getter;
}

export function setWatchedHandler(fn: (ev: WatchedEvent) => Promise<unknown>): void {
  handler = fn;
}

/** 处理来自启动参数 / 二次实例 / 协议唤醒的「已看」事件 */
export async function handleIngestArgv(argv: string[], from: 'url' | 'cli'): Promise<WatchedEvent[]> {
  const events = parseIngestArgs(argv).map((ev) => ({ ...ev, source: from }));
  if (!events.length) return [];
  const win = mainWindow();
  for (const ev of events) {
    try {
      await handler?.(ev);
    } catch {
      /* 单个失败不影响其他事件 */
    }
    win?.webContents.send('watched:incoming', ev);
  }
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  return events;
}

/** 注册 bgmtv-helper:// 协议（开发模式下需要同时传入脚本路径） */
export function registerProtocol(): void {
  const protocol = 'bgmtv-helper';
  try {
    if (process.defaultApp) {
      // 开发：electron.exe <入口脚本>（Windows 上 entry 可能是 . 或 main.js）
      const entry = process.argv[1];
      if (entry) app.setAsDefaultProtocolClient(protocol, process.execPath, [entry]);
      return;
    }
    if (process.platform !== 'win32') {
      app.setAsDefaultProtocolClient(protocol);
      return;
    }
    // 打包后 Windows 上首次运行可能需要提升权限才能写入注册表
    if (!app.setAsDefaultProtocolClient(protocol)) {
      app.setAsDefaultProtocolClient(protocol, process.execPath, []);
    }
  } catch {
    /* 受管环境无法写注册表时静默失败，CLI 参数方式仍可用 */
  }
}

export function registerIngestIpc(): void {
  ipcMain.handle('ingest:simulate', async (_e, ev: WatchedEvent) => {
    await handler?.(ev);
    return true;
  });
  ipcMain.handle('ingest:parse', (_e, argv: string[]) => parseIngestArgs(argv));
  ipcMain.handle('app:open-external', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url);
  });
}
