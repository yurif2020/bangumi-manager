import { useMemo } from 'react';
import type { CollectionItem, CollectionType, Subject } from '../../electron/shared/types';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import { SubjectCard } from '../components/SubjectCard';
import { SkeletonCard } from '../components/Skeleton';

interface Props {
  keyword: string;
  collections: CollectionItem[];
  onCollect: (subject: Subject, type: CollectionType) => void;
  onOpen: (subject: Subject) => void;
}

export function SearchView({ keyword, collections, onCollect, onOpen }: Props) {
  const { data, loading, error } = useDebouncedSearch(keyword);
  const typeOf = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of collections) map.set(c.subjectId, c.type);
    return map;
  }, [collections]);

  if (!keyword.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="text-4xl">🔍</div>
        <p className="text-sm text-ink-400">输入关键词开始搜索，支持中文名 / 原名</p>
        <p className="text-xs text-ink-600">快捷搜索：Ctrl + K</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-rose-300">{error}</p>
        <p className="text-xs text-ink-500">请检查网络或代理设置</p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (data?.items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-400">
        没有找到「{keyword}」相关的番剧
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        {loading ? '搜索中…' : `共 ${data?.total ?? 0} 条结果`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {data?.items.map((s) => (
          <SubjectCard
            key={s.id}
            subject={s}
            currentType={typeOf.get(s.id)}
            onCollect={(subject, type) => onCollect(subject, type as CollectionType)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
