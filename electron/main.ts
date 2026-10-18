import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { registerAuthIpc } from './ipc/authIpc';
import { registerLibraryIpc, registerSyncIpc } from './ipc/libraryIpc';
import { registerCacheIpc, registerSeasonIpc } from './ipc/seasonIpc';
import {
  handleIngestArgv,
  registerIngestIpc,
  registerProtocol,
  setIngestWindow,
  setWatchedHandler,
} from './bridge/ingest';
import { applyProxy } from './store/proxy';
import { readSettings } from './store/settings';
import { SyncEngine } from './sync/engine';
import { getEpisodes, listUserEpisodes } from './bgm/endpoints';
import { broadcastRefresh, broadcastSync, broadcastToast, scheduleAutoRefresh } from './ipc/events';
import { applyLaunchAtLogin } from './bridge/autostart';
import { startImageCacheMaintenance, stopImageCacheMaintenance } from './cache/imageCache';
import { purgeSeasonCache } from './cache/seasonCache';
import type { WatchedEvent } from './shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const HIDDEN = process.argv.includes('--hidden');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const engine = new SyncEngine({
  onError: (msg) => broadcastToast('error', msg),
  onSynced: () => {
    broadcastSync(engine);
    broadcastRefresh();
  },
  onStateChange: () => broadcastSync(engine),
  resolveEpisode: async (subjectId, ep) => {
    const eps = await getEpisodes(subjectId);
    const main = eps.filter((e) => e.type === 0 || e.type === undefined);
    if (!main.length) return null;
    if (ep !== undefined) {
      const target =
        main.find((e) => Number(e.sort) === Number(ep)) ??
        main.find((e) => Number(e.ep) === Number(ep)) ??
        main[Number(ep) - 1];
      return target ? { episodeId: target.id, ep: Number(target.sort || target.ep || ep) } : null;
    }
    // 未指定集数：推进到「第一个未看」的下一集
    let watched = 0;
    try {
      const rows = await listUserEpisodes(subjectId);
      watched = rows.filter((r) => r.type === 2).length;
    } catch {
      /* 未登录时退化为第一集 */
    }
    const target = main[watched] ?? main[0];
    return target ? { episodeId: target.id, ep: Number(target.sort) } : null;
  },
  confirmConflict: async ({ subjectId, remoteUpdatedAt }) => {
    const remote = new Date(remoteUpdatedAt).toLocaleString('zh-CN');
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['覆盖远端', '放弃本次修改'],
      defaultId: 1,
      cancelId: 1,
      title: '进度冲突',
      message: `番剧 #${subjectId} 在网页端有更新的记录`,
      detail: `远端最后更新于 ${remote}。是否仍以本机操作覆盖？`,
    };
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    return response === 0;
  },
});

function createWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#15171c',
    autoHideMenuBar: true,
    title: '番剧管理',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => {
    if (!HIDDEN) win?.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭到托盘
  win.on('close', (event) => {
    if (!quitting && readSettings().closeToTray) {
      event.preventDefault();
      win?.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'));

  return win;
}

function showWindow(): void {
  if (!win) createWindow();
  if (win?.isMinimized()) win.restore();
  win?.show();
  win?.focus();
}

/**
 * 托盘图标：用 32×32 位图绘制一个圆角方块 + 「番」字轮廓。
 * 不依赖任何外部图片文件，并在资源管理器缩放 125%/150% 时仍保持清晰。
 */
function trayIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      // 圆角判定：超出圆角半径的角落留空
      const r = 7;
      const cx = Math.max(0, Math.abs(dx) - (radius - r));
      const cy = Math.max(0, Math.abs(dy) - (radius - r));
      const inside = Math.sqrt(cx * cx + cy * cy) <= r && Math.abs(dx) <= radius && Math.abs(dy) <= radius;
      if (!inside) {
        buf[i + 3] = 0;
        continue;
      }
      // 粉色渐变底 + 白色「番」字笔画（横杠 + 方框）
      const inBox = Math.abs(dx) <= 7 && Math.abs(dy) <= 6;
      const isStroke =
        inBox &&
        (Math.abs(dy) <= 1.5 || Math.abs(dx) <= 1.5 || Math.abs(Math.abs(dx) - 7) <= 1.2 || Math.abs(Math.abs(dy) - 6) <= 1.2);
      const topBar = Math.abs(dy + 10) <= 1.5 && Math.abs(dx) <= 6;
      const white = isStroke || topBar;
      const t = (y / size) * 0.35 + 0.65;
      buf[i] = white ? 255 : Math.round(243 * t);
      buf[i + 1] = white ? 255 : Math.round(103 * t);
      buf[i + 2] = white ? 255 : Math.round(155 * t);
      buf[i + 3] = 255;
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size });
  // Windows 上托盘按 @1x 取 16×16，等比缩放避免图标发虚
  return process.platform === 'win32' ? img.resize({ width: 16, height: 16 }) : img;
}

function buildTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('番剧管理');
  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => showWindow() },
    { label: '刷新收藏', click: () => broadcastRefresh() },
    {
      label: '立即同步',
      click: () => {
        void engine.flush().then((res) => {
          broadcastRefresh();
          if (res.pending === 0) broadcastToast('success', '同步完成');
        });
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showWindow());
}

async function handleWatched(ev: WatchedEvent): Promise<void> {
  const res = ev.episodeId
    ? await engine.markWatchedByEpisodeId(ev.episodeId, { subjectId: ev.subjectId, ep: ev.ep })
    : ev.subjectId !== undefined
      ? await engine.markWatchedByEp(ev.subjectId, ev.ep)
      : { ok: false, error: '缺少番剧 ID' };

  if (res.ok) {
    const label = res.ep ? `第 ${res.ep} 集` : '对应剧集';
    broadcastToast('success', `已记录：${ev.subjectId ? `番剧 #${ev.subjectId} ` : ''}${label} 已看`);
    broadcastRefresh();
    broadcastSync(engine);
  } else {
    broadcastToast('error', res.error ?? '记录失败');
  }
}

// 单实例：第二个实例把参数转发给已运行实例
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    void handleIngestArgv(argv, 'cli');
    showWindow();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    void handleIngestArgv([url], 'url');
    showWindow();
  });

  void app.whenReady().then(async () => {
    ipcMain.handle('app:ping', () => 'pong');
    registerAuthIpc();
    registerLibraryIpc({ engine });
    registerSyncIpc({ engine });
    registerSeasonIpc();
    registerCacheIpc();
    registerIngestIpc();
    registerProtocol();
    setWatchedHandler(handleWatched);
    setIngestWindow(() => win);

    await applyProxy();
    applyLaunchAtLogin(readSettings().launchAtLogin);
    createWindow();
    buildTray();

    startImageCacheMaintenance();
    // 季度索引：启动时清掉太久没更新过的缓存文件
    setTimeout(() => purgeSeasonCache(), 5_000);
    engine.startAutoFlush(30_000);
    scheduleAutoRefresh(engine);

    // 启动时立即处理命令行 / 协议传入的「已看」事件
    await handleIngestArgv(process.argv, 'cli');

    app.on('activate', () => showWindow());
  });
}

app.on('before-quit', () => {
  quitting = true;
  stopImageCacheMaintenance();
  engine.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});
