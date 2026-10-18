import { BrowserWindow } from 'electron';
import type { SyncState, WatchedEvent } from '../shared/types';
import { readSettings } from '../store/settings';

export function toSyncState(engine: { status: { lastSyncAt: number | null; syncing: boolean; pending?: number } }): SyncState {
  return {
    syncing: engine.status.syncing,
    lastSyncAt: engine.status.lastSyncAt,
    queueSize: engine.status.pending ?? 0,
  };
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

export function broadcastSync(engine: Parameters<typeof toSyncState>[0]): void {
  broadcast('sync:changed', toSyncState(engine));
}

export function broadcastToast(kind: 'info' | 'error' | 'success', text: string): void {
  broadcast('app:toast', { kind, text });
}

export function broadcastRefresh(): void {
  broadcast('app:refresh', undefined);
}

/** 默认刷新间隔（分钟），来自设置，最小 1 */
export function refreshIntervalMs(): number {
  const minutes = readSettings().refreshMinutes || 15;
  return Math.max(1, minutes) * 60_000;
}

/** 定时自动刷新：通知渲染层重新拉取收藏 + 重放离线队列 */
export function scheduleAutoRefresh(
  engine: { flush: () => Promise<unknown>; status: { pending?: number } },
): void {
  const tick = async () => {
    await engine.flush().catch(() => undefined);
    if ((engine.status.pending ?? 0) >= 0) broadcastRefresh();
  };
  setInterval(() => void tick(), refreshIntervalMs());
}

export type { WatchedEvent };
