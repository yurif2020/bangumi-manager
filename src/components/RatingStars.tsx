import { useState } from 'react';

interface Props {
  /** 当前评分 1–10，0 表示未评分 */
  value: number;
  /** 是否可用（未收藏时不能评分，Bangumi 要求先收藏） */
  disabled?: boolean;
  /** 保存中 */
  busy?: boolean;
  onChange: (rate: number) => void;
}

/**
 * 十分制评分：鼠标悬停预览，点击写入；再次点击当前分数可取消评分（`allowClear`）。
 * 视觉上两星代表 1 分，与 Bangumi 网页端的十星制一致。
 */
export function RatingStars({ value, disabled, busy, onChange }: Props) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  const commit = (rate: number) => {
    if (disabled || busy) return;
    onChange(rate);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHover(0)}
        role="radiogroup"
        aria-label="评分"
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const score = i + 1;
          const active = shown >= score;
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={value === score}
              aria-label={`${score} 分`}
              disabled={disabled || busy}
              onMouseEnter={() => !disabled && setHover(score)}
              onClick={() => commit(value === score ? 0 : score)}
              title={disabled ? '先加入收藏才能评分' : `${score} 分`}
              className={`transition ${disabled || busy ? 'cursor-not-allowed opacity-40' : 'hover:scale-110'}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                className={active ? 'text-amber-400' : 'text-ink-700'}
                fill="currentColor"
              >
                <path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
              </svg>
            </button>
          );
        })}
      </div>
      <span className="w-10 shrink-0 text-[11px] tabular-nums text-ink-400">
        {busy ? '保存中…' : shown > 0 ? `${shown} 分` : '未评分'}
      </span>
    </div>
  );
}
