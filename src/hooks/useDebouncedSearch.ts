import { useEffect, useRef, useState } from 'react';

/** 200ms 防抖 + 竞态保护：只接受最后一次请求的结果 */
export function useDebouncedSearch(keyword: string, delay = 200) {
  const [data, setData] = useState<{ total: number; items: import('../../electron/shared/types').Subject[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const kw = keyword.trim();
    if (!kw) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      window.api.search
        .query(kw)
        .then((res) => {
          if (id !== seq.current) return;
          setData(res);
        })
        .catch((err: Error) => {
          if (id !== seq.current) return;
          setError(err.message || '搜索失败');
          setData(null);
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [keyword, delay]);

  return { data, loading, error };
}
