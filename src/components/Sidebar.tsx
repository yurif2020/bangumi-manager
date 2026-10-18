import type { ViewKey } from '../lib/views';
import { NAV_ITEMS } from '../lib/views';

interface Props {
  current: ViewKey;
  counts: Record<string, number>;
  userName?: string;
  avatar?: string;
  loggedIn: boolean;
  /** 待同步的离线操作数量 */
  queueSize: number;
  onChange: (view: ViewKey) => void;
}

export function Sidebar({ current, counts, userName, avatar, loggedIn, queueSize, onChange }: Props) {
  const navClass = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
      active ? 'bg-ink-800/80 text-ink-50' : 'text-ink-400 hover:bg-ink-900 hover:text-ink-200'
    }`;

  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-r border-ink-800/80 bg-ink-950/60">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
          番
        </div>
        <span className="text-sm font-semibold tracking-wide text-ink-100">番剧管理</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <button key={item.key} onClick={() => onChange(item.key)} className={navClass(current === item.key)}>
            <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
            <span className="flex-1 text-left">{item.label}</span>
            <span className="text-xs tabular-nums text-ink-500">{counts[item.key] ?? 0}</span>
          </button>
        ))}

        <div className="my-2 h-px bg-ink-800/70" />

        <button onClick={() => onChange('search')} className={navClass(current === 'search')}>
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
          <span className="flex-1 text-left">搜索</span>
        </button>
        <button onClick={() => onChange('index')} className={navClass(current === 'index')}>
          <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
          <span className="flex-1 text-left">季度索引</span>
        </button>
        <button onClick={() => onChange('settings')} className={navClass(current === 'settings')}>
          <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
          <span className="flex-1 text-left">设置</span>
        </button>
      </nav>

      <div className="flex items-center gap-2 border-t border-ink-800/80 p-3">
        {loggedIn ? (
          <>
            {avatar ? (
              <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-ink-700" />
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-ink-300">{userName ?? '已登录'}</span>
            {queueSize > 0 && (
              <button
                onClick={() => onChange('settings')}
                title={`${queueSize} 项操作等待同步`}
                className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300"
              >
                待同步 {queueSize}
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onChange('settings')}
            className="w-full rounded-lg bg-brand-500/15 px-3 py-1.5 text-xs text-brand-400 hover:bg-brand-500/25"
          >
            未登录 · 点击登录
          </button>
        )}
      </div>
    </aside>
  );
}
