import {
  getCollectionUpdatedAt,
  markEpisodeWatched,
  removeCollection as apiRemoveCollection,
  updateCollection,
} from '../bgm/endpoints';
import { getCredentials } from '../bgm/client';
import type { CollectionType, SyncState, WatchedEvent, WatchedResult } from '../shared/types';
import { OfflineQueue, type Operation } from './offlineQueue';

export interface CollectionResult {
  ok: boolean;
  queued?: boolean;
  error?: string;
  /** 远端已有更新的进度，本次写入被拦截 */
  conflict?: { remoteUpdatedAt: number; remoteEpStatus?: number };
}

export interface SyncHooks {
  onError?: (message: string) => void;
  onSynced?: (detail?: WatchedEvent) => void;
  onStateChange?: (state: SyncState) => void;
  /** 把「某番剧第 ep 集」解析成 episodeId */
  resolveEpisode?: (subjectId: number, ep?: number) => Promise<{ episodeId: number; ep: number } | null>;
  /** 冲突确认：远端比本地新时是否仍然覆盖 */
  confirmConflict?: (info: { subjectId: number; localUpdatedAt: number; remoteUpdatedAt: number }) => Promise<boolean>;
}

function isAuthError(message: string): boolean {
  return message.includes('登录已失效') || message.includes('尚未登录');
}

/**
 * 同步引擎：
 *  - 写操作先乐观更新 UI（渲染层负责），这里负责提交与失败入队
 *  - 「标记已看」是唯一入口：UI 点击、URL scheme、CLI 参数都走这里
 *  - 同一目标并发请求去重（inflight map）
 *  - 失败的操作进入离线队列，指数退避重放
 *  - 收藏写入前比对远端 updated_at，远端更新时提示冲突
 */
export class SyncEngine {
  readonly queue = new OfflineQueue();
  private inflight = new Map<string, Promise<WatchedResult>>();
  private lastSyncAt: number | null = null;
  private syncing = false;
  private timer: NodeJS.Timeout | null = null;
  /** 收集中：每个条目最近一次本地成功写入的时间 */
  private localWrites = new Map<number, number>();

  constructor(private readonly hooks: SyncHooks = {}) {}

  get status() {
    return { lastSyncAt: this.lastSyncAt, syncing: this.syncing, pending: this.queue.size };
  }

  get state(): SyncState {
    return { syncing: this.syncing, lastSyncAt: this.lastSyncAt, queueSize: this.queue.size };
  }

  private emitState(): void {
    this.hooks.onStateChange?.(this.state);
  }

  /** 记录本地写入时间，供冲突检测使用 */
  markLocalWrite(subjectId: number): void {
    this.localWrites.set(subjectId, Date.now());
  }

  localWriteAt(subjectId: number): number | undefined {
    return this.localWrites.get(subjectId);
  }

  markSynced(detail?: WatchedEvent): void {
    this.lastSyncAt = Date.now();
    this.syncing = false;
    this.hooks.onSynced?.(detail);
    this.emitState();
  }

  startAutoFlush(intervalMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), intervalMs);
    if (this.queue.size) void this.flush();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async flush(): Promise<{ done: number; pending: number; errors: string[] }> {
    if (this.queue.size === 0) return { done: 0, pending: 0, errors: [] };
    this.syncing = true;
    this.emitState();
    try {
      const res = await this.queue.flush((op) => this.execute(op), { max: 20 });
      if (res.done) {
        this.lastSyncAt = Date.now();
        this.hooks.onSynced?.();
      }
      if (res.errors.length) this.hooks.onError?.(`部分操作仍未成功：${res.errors[0]}`);
      return res;
    } finally {
      this.syncing = false;
      this.emitState();
    }
  }

  private async execute(op: Operation): Promise<void> {
    if (op.kind === 'episode') {
      if (!op.episodeId) throw new Error('队列项缺少 episodeId');
      await markEpisodeWatched(op.episodeId, op.status ?? 2);
      return;
    }
    if (op.type === 0) {
      await apiRemoveCollection(op.subjectId);
      return;
    }
    await updateCollection(op.subjectId, {
      type: op.type as CollectionType,
      rate: op.rate,
    });
  }

  /** 单集状态写入（含失败入队、去重） */
  async markWatchedByEpisodeId(
    episodeId: number,
    extra: { subjectId?: number; ep?: number; status?: 0 | 1 | 2 | 3 } = {},
  ): Promise<WatchedResult> {
    const status = extra.status ?? 2;
    const key = `ep:${episodeId}:${status}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = (async (): Promise<WatchedResult> => {
      try {
        await markEpisodeWatched(episodeId, status);
        if (extra.subjectId) this.markLocalWrite(extra.subjectId);
        this.markSynced({
          episodeId,
          subjectId: extra.subjectId,
          ep: extra.ep,
          at: Date.now(),
          source: 'ui',
        });
        return { ok: true, episodeId, subjectId: extra.subjectId, ep: extra.ep };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 凭据问题无法靠重放解决
        if (isAuthError(message)) return { ok: false, error: message };
        this.queue.push({
          kind: 'episode',
          subjectId: extra.subjectId ?? 0,
          episodeId,
          ep: extra.ep,
          status,
          at: Date.now(),
        });
        this.emitState();
        this.hooks.onError?.(`网络异常，已加入待同步队列：${message}`);
        return { ok: true, episodeId, subjectId: extra.subjectId, ep: extra.ep, queued: true };
      }
    })();
    this.inflight.set(key, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** 撤销单集已看（type 0） */
  async unmarkEpisode(episodeId: number): Promise<WatchedResult> {
    return this.markWatchedByEpisodeId(episodeId, { status: 0 });
  }

  /** 「某番剧第 ep 集已看」：外部程序入口，自动解析 episodeId；ep 缺省表示下一集 */
  async markWatchedByEp(subjectId: number, ep?: number): Promise<WatchedResult> {
    const key = `sub:${subjectId}:${ep ?? 'next'}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = (async (): Promise<WatchedResult> => {
      try {
        const resolved = await this.hooks.resolveEpisode?.(subjectId, ep);
        if (!resolved) return { ok: false, error: '没有找到对应的章节，请确认番剧 ID 与集数' };
        return await this.markWatchedByEpisodeId(resolved.episodeId, { subjectId, ep: resolved.ep });
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();
    this.inflight.set(key, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * 设置收藏状态；type 0 表示取消收藏。
   * 写入前比对远端 updated_at：远端比本地最近一次写入还新时视为冲突，
   * 交给 confirmConflict 决策（默认直接覆盖）。
   */
  async setCollection(
    subjectId: number,
    type: CollectionType | 0,
    patch: { rate?: number } = {},
  ): Promise<CollectionResult> {
    const cred = getCredentials();
    const user = cred?.userId ?? cred?.userName;
    if (user && this.hooks.confirmConflict) {
      const remote = await getCollectionUpdatedAt(user, subjectId);
      const local = this.localWrites.get(subjectId);
      if (remote && local && remote > local + 1000) {
        const proceed = await this.hooks.confirmConflict({ subjectId, localUpdatedAt: local, remoteUpdatedAt: remote });
        if (!proceed) {
          return { ok: false, conflict: { remoteUpdatedAt: remote }, error: '已放弃本次修改' };
        }
      }
    }

    try {
      if (type === 0) await apiRemoveCollection(subjectId);
      else await updateCollection(subjectId, { type, rate: patch.rate });
      this.markLocalWrite(subjectId);
      this.markSynced();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthError(message)) return { ok: false, error: message };
      this.queue.push({
        kind: 'collection',
        subjectId,
        type,
        rate: patch.rate,
        at: Date.now(),
      });
      this.emitState();
      this.hooks.onError?.(`收藏状态已暂存，稍后自动重试：${message}`);
      return { ok: true, queued: true };
    }
  }

  async removeCollection(subjectId: number): Promise<CollectionResult> {
    return this.setCollection(subjectId, 0);
  }
}
