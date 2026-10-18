export function subjectTitle(s: { nameCn?: string; name: string }): string {
  return s.nameCn?.trim() || s.name;
}

export function subjectSubTitle(s: { nameCn?: string; name: string }): string {
  return s.nameCn?.trim() ? s.name : '';
}

export function yearOf(date?: string): string {
  if (!date) return '';
  const m = date.match(/^(\d{4})/);
  return m ? m[1] : '';
}

export function formatDate(date?: string): string {
  if (!date) return '未定';
  return date.replace(/-/g, '/');
}

export function ratingOf(s: { rating?: { score?: number } }): string {
  const score = s.rating?.score ?? 0;
  return score > 0 ? score.toFixed(1) : '—';
}

export function heatOf(s: { collection?: { doing?: number; collect?: number; wish?: number } }): number {
  const c = s.collection;
  if (!c) return 0;
  return (c.doing ?? 0) + (c.collect ?? 0) + (c.wish ?? 0);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function episodesTotal(s: { totalEpisodes?: number; eps?: number }): number {
  return s.totalEpisodes || s.eps || 0;
}

export function proxyModeLabel(mode: string): string {
  return mode === 'system' ? '系统代理' : mode === 'direct' ? '直连' : '自定义代理';
}

/** 季度名：1→冬（1 月），2→春（4 月），3→夏（7 月），4→秋（10 月） */
export function seasonLabel(year: number, quarter: 1 | 2 | 3 | 4): string {
  const names: Record<number, string> = { 1: '冬', 2: '春', 3: '夏', 4: '秋' };
  return `${year} ${names[quarter]}季`;
}

/** 季度的简称，用于季度切换按钮 */
export function quarterName(quarter: 1 | 2 | 3 | 4): string {
  return ['冬', '春', '夏', '秋'][quarter - 1] ?? '';
}

/** 季度起始月份，用于提示「冬（1 月）」 */
export function quarterMonths(quarter: 1 | 2 | 3 | 4): string {
  const start = (quarter - 1) * 3 + 1;
  return `${start}–${start + 2} 月`;
}
