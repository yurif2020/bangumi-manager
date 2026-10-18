import { useEffect } from 'react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

/** 高清大图查看：点击遮罩、关闭按钮或 Esc 退出 */
export function Lightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="查看大图"
    >
      <img
        src={src}
        alt={alt ?? ''}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
      />
      <button
        onClick={onClose}
        className="absolute right-5 top-5 rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white/80 hover:text-white"
        title="关闭（Esc）"
      >
        ✕
      </button>
    </div>
  );
}
