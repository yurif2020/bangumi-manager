import { useCallback, useEffect, useRef, useState } from 'react';
import type { CollectionItem, CollectionType, Subject } from '../../electron/shared/types';

interface Options {
  refreshKey: number;
  userKey: string | number | undefined;
  onError?: (msg: string) => void;
}

const TYPES: CollectionType[] = [1, 2, 3, 4, 5];

/**
 * 拉取全部收藏（五种状态），供侧边栏计数、搜索卡状态标记与在看列表使用。
 * 各状态并行分页拉取；失败的状态不影响其它状态。
 */
export function useCollections({ refreshKey, userKey, onError }: Options) {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!userKey) {
      setCollections([]);
      setError(null);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    Promise.all(
      TYPES.map((t) =>
        window.api.collection.all(t).catch((err: Error) => {
          if (id === seq.current) onError?.(`拉取「${t}」列表失败：${err.message}`);
          return [] as CollectionItem[];
        }),
      ),
    )
      .then((lists) => {
        if (id !== seq.current) return;
        setCollections(lists.flat());
        setError(null);
      })
      .catch((err: Error) => {
        if (id === seq.current) setError(err.message);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [refreshKey, userKey, onError]);

  /** 乐观更新：切换状态 / 移除 */
  const applyLocal = useCallback((subject: Subject, type: CollectionType | 0) => {
    setCollections((prev) => {
      const rest = prev.filter((c) => c.subjectId !== subject.id);
      if (type === 0) return rest;
      const old = prev.find((c) => c.subjectId === subject.id);
      return [
        ...rest,
        {
          subjectId: subject.id,
          type,
          rate: old?.rate ?? 0,
          epStatus: old?.epStatus ?? 0,
          volStatus: old?.volStatus ?? 0,
          updatedAt: Date.now(),
          subject,
        },
      ];
    });
  }, []);

  /** 乐观推进某条目的已看进度 */
  const bumpProgress = useCallback((subjectId: number, epStatus: number) => {
    setCollections((prev) =>
      prev.map((c) => (c.subjectId === subjectId ? { ...c, epStatus, updatedAt: Date.now() } : c)),
    );
  }, []);

  return { collections, loading, error, applyLocal, bumpProgress };
}
