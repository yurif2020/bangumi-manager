import { useEffect } from 'react';
import type { Subject } from '../../electron/shared/types';
import { CoverImage } from './CoverImage';
import { heatOf, ratingOf, subjectSubTitle, subjectTitle, yearOf } from '../lib/format';

export const COLLECTION_TYPES = [
  { type: 3, label: '在看', tone: 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' },
  { type: 1, label: '想看', tone: 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25' },
  { type: 2, label: '看过', tone: 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25' },
  { type: 4, label: '搁置', tone: 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25' },
  { type: 5, label: '抛弃', tone: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25' },
] as const;

interface Props {
  subject: Subject;
  currentType?: number;
  onCollect: (subject: Subject, type: number) => void;
  onOpen?: (subject: Subject) => void;
}

export function SubjectCard({ subject, currentType, onCollect, onOpen }: Props) {
  const cover = subject.images?.common || subject.images?.medium || subject.images?.large;
  return (
    <article className="group flex animate-fade-up gap-3 rounded-xl border border-ink-800 bg-ink-900/50 p-3 transition hover:border-ink-700 hover:bg-ink-900">
      <button onClick={() => onOpen?.(subject)} className="shrink-0">
        <CoverImage src={cover} alt={subjectTitle(subject)} className="w-[72px] rounded-lg" />
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={() => onOpen?.(subject)} className="block w-full text-left">
          <h3 className="truncate text-sm font-semibold text-ink-100">{subjectTitle(subject)}</h3>
          {subjectSubTitle(subject) && (
            <p className="truncate text-xs text-ink-500">{subjectSubTitle(subject)}</p>
          )}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span>{yearOf(subject.date) || '未定'}</span>
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
              <path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
            </svg>
            {ratingOf(subject)}
          </span>
          {heatOf(subject) > 0 && <span>热度 {heatOf(subject)}</span>}
          {subject.eps ? <span>{subject.eps} 集</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COLLECTION_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => onCollect(subject, t.type)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${t.tone} ${
                currentType === t.type ? 'ring-1 ring-current' : ''
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
