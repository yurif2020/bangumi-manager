import type { WatchedEvent, WatchedEventSource } from '../shared/types';

export const PROTOCOL = 'bgmtv-helper';

/**
 * 解析 URL 或命令行参数为统一的「已看」事件。
 *
 * 支持的形态：
 *   bgmtv-helper://watched?subject=123&ep=5
 *   bgmtv-helper://watched/123/5
 *   --watched subject=123 --ep=5 [--episode=456]
 *   --watched 123:5
 *   --episode 456
 */
export function parseIngestArgs(argv: string[]): WatchedEvent[] {
  const events: WatchedEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith(`${PROTOCOL}://`)) {
      const ev = parseProtocolUrl(arg);
      if (ev) events.push(ev);
      continue;
    }

    if (arg === '--watched' || arg === '-w') {
      const value = argv[i + 1] ?? '';
      const ev = parseWatchedValue(value);
      if (ev) {
        events.push(ev);
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('--watched=')) {
      const ev = parseWatchedValue(arg.slice('--watched='.length));
      if (ev) events.push(ev);
      continue;
    }

    if (arg === '--episode') {
      const episodeId = Number(argv[i + 1]);
      if (Number.isFinite(episodeId)) {
        events.push({ episodeId, at: now, source: 'cli' });
        i += 1;
      }
      continue;
    }

    // --ep 是「集数」，挂到最近的 subject 上（由下方合并逻辑处理）
    if (arg === '--ep') {
      const ep = Number(argv[i + 1]);
      if (Number.isFinite(ep)) {
        events.push({ ep, at: now, source: 'cli' });
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('--episode=')) {
      const episodeId = Number(arg.slice('--episode='.length));
      if (Number.isFinite(episodeId)) events.push({ episodeId, at: now, source: 'cli' });
      continue;
    }

    if (arg.startsWith('--ep=')) {
      const ep = Number(arg.slice('--ep='.length));
      if (Number.isFinite(ep)) events.push({ ep, at: now, source: 'cli' });
    }
  }

  // 合并同一批参数里拆开的 subject/ep：--ep 单独出现时挂到最近的 subject 上
  const merged: WatchedEvent[] = [];
  let lastSubject: WatchedEvent | null = null;
  for (const ev of events) {
    if (ev.subjectId !== undefined) {
      lastSubject = { ...ev };
      merged.push(lastSubject);
    } else if (lastSubject && ev.ep !== undefined && lastSubject.ep === undefined) {
      lastSubject.ep = ev.ep;
    } else {
      merged.push(ev);
    }
  }
  return merged;
}

function parseProtocolUrl(raw: string): WatchedEvent | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const source: WatchedEventSource = 'url';
  const at = Date.now();

  // host 形如 watched，pathname 可能是 /123/5
  const subjectParam = url.searchParams.get('subject') ?? url.searchParams.get('subjectId');
  const epParam = url.searchParams.get('ep') ?? url.searchParams.get('episode');
  const episodeParam = url.searchParams.get('episodeId');
  const pathParts = url.pathname.split('/').filter(Boolean).map(Number);

  const subjectId = subjectParam ? Number(subjectParam) : Number.isFinite(pathParts[0]) ? pathParts[0] : undefined;
  const ep = epParam ? Number(epParam) : Number.isFinite(pathParts[1]) ? pathParts[1] : undefined;
  const episodeId = episodeParam ? Number(episodeParam) : undefined;

  if (subjectId === undefined && episodeId === undefined) return null;
  return { subjectId, ep, episodeId, at, source };
}

/**
 * 支持 "subject=123"、"subject=123,ep=5"、"123:5"、"123"。
 * 若只给 subject 未给 ep，则表示「推进一集」，由上层决定。
 */
function parseWatchedValue(value: string): WatchedEvent | null {
  if (!value) return null;
  const at = Date.now();
  const source: WatchedEventSource = 'cli';

  if (value.includes('=')) {
    const pairs: Record<string, number> = {};
    for (const kv of value.split(/[,&]/)) {
      const eq = kv.indexOf('=');
      if (eq <= 0) continue;
      const key = kv.slice(0, eq).trim();
      const raw = kv.slice(eq + 1).trim();
      const num = Number(raw);
      if (Number.isFinite(num)) pairs[key] = num;
    }
    const subjectId = pairs.subject ?? pairs.subjectId ?? pairs.id;
    const ep = pairs.ep ?? pairs.ep;
    const episodeId = pairs.episodeId ?? pairs.episode;
    if (subjectId === undefined && episodeId === undefined) return null;
    return { subjectId, ep, episodeId, at, source };
  }

  if (value.includes(':')) {
    const [s, e] = value.split(':').map(Number);
    if (!Number.isFinite(s)) return null;
    return { subjectId: s, ep: Number.isFinite(e) ? e : undefined, at, source };
  }

  const subjectId = Number(value);
  if (!Number.isFinite(subjectId)) return null;
  return { subjectId, at, source };
}
