import { useEffect, useState } from 'react';

interface Props {
  src?: string;
  alt?: string;
  className?: string;
  ratio?: string;
}

/** 懒加载封面：加载中显示渐变占位，失败显示图标 */
export function CoverImage({ src, alt, className = '', ratio = 'aspect-[2/3]' }: Props) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');

  useEffect(() => {
    setState(src ? 'loading' : 'error');
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-ink-800 ${ratio} ${className}`}>
      <div
        className={`absolute inset-0 bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 transition-opacity duration-300 ${
          state === 'ok' ? 'opacity-0' : 'opacity-100'
        }`}
      />
      {state === 'ok' ? null : state === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center text-ink-600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="m7 15 3-3 3 3 2-2 3 3" strokeLinecap="round" />
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-ink-800/60" />
      )}
      {src && (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            setState('ok');
            // 记录访问时间，供设置页统计与过期清理使用
            const img = e.currentTarget;
            const size = Number(img.naturalWidth) * Number(img.naturalHeight) * 4;
            window.api?.cache?.touch?.(img.currentSrc || img.src, size);
          }}
          onError={() => setState('error')}
          className={`h-full w-full object-cover transition-opacity duration-300 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}
