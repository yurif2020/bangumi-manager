import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * 写操作队列项。
 *  - episode：设置单集状态（1 看过 / 0 撤销 / 2 抛弃）
 *  - collection：设置收藏状态（type 0 表示取消收藏）
 */
export type Operation =
  | {
      kind: 'episode';
      subjectId: number;
      episodeId: number;
      ep?: number;
      /** 目标状态，缺省 2（看过）；0 未看，3 抛弃 */
      status?: 0 | 1 | 2 | 3;
      at: number;
    }
  | {
      kind: 'collection';
      subjectId: number;
      type: number;
      rate?: number;
      at: number;
    };

export type QueueItem = Operation & { id: string; retries: number; nextAt: number };

const queueFile = () => path.join(app.getPath('userData'), 'queue.json');

/**
 * 离线队列：写操作失败时入队，按指数退避重放。
 * 持久化到 userData/queue.json，跨重启保留。
 */
export class OfflineQueue {
  private items: QueueItem[] = [];
  private loaded = false;

  get size(): number {
    this.load();
    return this.items.length;
  }

  list(): QueueItem[] {
    this.load();
    return this.items.slice();
  }

  /** 同一目标只保留最后一次操作（旧的未发送操作已被覆盖） */
  push(op: Operation): string {
    this.load();
    const sameTarget = (i: QueueItem) => {
      if (op.kind === 'episode' && i.kind === 'episode') return i.episodeId === op.episodeId;
      if (op.kind === 'collection' && i.kind === 'collection') return i.subjectId === op.subjectId;
      return false;
    };
    this.items = this.items.filter((i) => !sameTarget(i));
    const id = `${op.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.items.push({ ...op, id, retries: 0, nextAt: 0 });
    this.persist();
    return id;
  }

  remove(id: string): void {
    this.load();
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
  }

  clear(): void {
    this.load();
    this.items = [];
    this.persist();
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(queueFile(), 'utf8'));
      if (Array.isArray(parsed)) {
        // 兼容旧版本（kind 曾为 episode-watched）的队列结构
        this.items = (parsed as Array<Record<string, unknown>>).map((raw) => {
          if (raw && raw.kind === 'episode-watched') {
            return {
              ...raw,
              kind: 'episode',
              episodeId: Number(raw.episodeId ?? 0),
              status: 2,
            } as unknown as QueueItem;
          }
          return raw as unknown as QueueItem;
        });
      }
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(queueFile(), JSON.stringify(this.items));
    } catch {
      /* 磁盘不可写时仅保留内存队列 */
    }
  }

  async flush(
    executor: (op: Operation) => Promise<void>,
    opts: { max?: number; now?: number } = {},
  ): Promise<{ done: number; pending: number; errors: string[] }> {
    this.load();
    const now = opts.now ?? Date.now();
    const max = opts.max ?? 20;
    let done = 0;
    const errors: string[] = [];
    const due = this.items.filter((i) => i.nextAt <= now).slice(0, max);
    for (const item of due) {
      const { id, retries, nextAt, ...op } = item;
      void nextAt;
      try {
        await executor(op as Operation);
        this.items = this.items.filter((i) => i.id !== id);
        done += 1;
      } catch (err) {
        item.retries = retries + 1;
        item.nextAt = now + Math.min(2 ** retries * 1000, 60_000);
        // 连续失败太多次：丢弃，避免永久卡住队列
        if (item.retries > 8) this.items = this.items.filter((i) => i.id !== id);
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    this.persist();
    return { done, pending: this.items.length, errors };
  }
}
