import { useEffect, useState } from 'react';
import { LoginPanel } from '../components/LoginPanel';
import type { AccentColor, ImageCacheStats, Settings } from '../../electron/shared/types';

/** 字节数转成易读单位 */
function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 可选强调色，色值与 index.css 中的 --brand-* 对应 */
const ACCENTS: Array<{ key: AccentColor; label: string; color: string }> = [
  { key: 'pink', label: '樱粉', color: '#f3679b' },
  { key: 'blue', label: '晴蓝', color: '#4f8cf5' },
  { key: 'green', label: '薄荷', color: '#36bd85' },
  { key: 'purple', label: '紫罗兰', color: '#936aff' },
  { key: 'orange', label: '落日', color: '#f69230' },
  { key: 'teal', label: '青碧', color: '#2db8b8' },
];

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onRefresh: () => void;
}

export function SettingsView({ settings, onChange, onRefresh }: Props) {
  const [refreshMinutes, setRefreshMinutes] = useState(String(settings.refreshMinutes));
  const [cache, setCache] = useState<ImageCacheStats | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheNote, setCacheNote] = useState('');

  const loadCache = () => {
    window.api.cache.stats().then(setCache).catch(() => setCache(null));
  };

  useEffect(() => {
    loadCache();
  }, []);

  const runCacheAction = async (action: 'expired' | 'all') => {
    if (action === 'all' && !window.confirm('将清空所有已缓存的封面图片，下次浏览会重新下载。继续？')) {
      return;
    }
    setCacheBusy(true);
    setCacheNote('');
    try {
      if (action === 'expired') {
        const res = await window.api.cache.clearExpired();
        setCache(res.stats);
        setCacheNote(res.removed > 0 ? `已清理 ${res.removed} 张过期图片` : '没有过期图片');
      } else {
        setCache(await window.api.cache.clearAll());
        setCacheNote('缓存已清空');
      }
    } catch (err) {
      setCacheNote(err instanceof Error ? err.message : '操作失败');
    } finally {
      setCacheBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-10">
      <div>
        <h1 className="text-lg font-semibold text-ink-100">设置</h1>
        <p className="mt-1 text-xs text-ink-500">登录、网络与常规选项</p>
      </div>

      <LoginPanel settings={settings} onChange={onChange} onRefresh={onRefresh} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-200">外部程序接口</h2>
        <div className="space-y-2 rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-xs text-ink-400">
          <p>其他程序可通过 URL 协议或命令行参数告知「某集已看」：</p>
          <code className="block rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11px] text-ink-300">
            bgmtv-helper://watched?subject=400602&amp;ep=5
          </code>
          <code className="block rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11px] text-ink-300">
            番剧管理.exe --watched subject=400602 --ep=5
          </code>
          <p className="text-ink-500">
            省略 ep 时自动推进到下一集；已运行的应用会被唤醒并立即写入进度。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-200">网络</h2>
        <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-sm">
          <label className="flex items-center justify-between gap-4">
            <span className="text-ink-300">代理模式</span>
            <select
              value={settings.proxyMode}
              onChange={(e) => onChange({ proxyMode: e.target.value as Settings['proxyMode'] })}
              className="rounded-lg border border-ink-700 bg-ink-950 px-2 py-1 outline-none focus:border-brand-500"
            >
              <option value="system">跟随系统代理</option>
              <option value="directPlus">直连 + 加密 DNS（DoH/ECH）</option>
              <option value="direct">直连</option>
              <option value="manual">自定义代理</option>
            </select>
          </label>
          {settings.proxyMode === 'manual' && (
            <input
              value={settings.proxyRules}
              onChange={(e) => onChange({ proxyRules: e.target.value })}
              placeholder="http://127.0.0.1:7890"
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-xs outline-none focus:border-brand-500"
            />
          )}
          {settings.proxyMode === 'directPlus' && (
            <div className="space-y-2 text-xs leading-relaxed text-ink-500">
              <p>
                直连访问 Bangumi，同时用加密 DNS 查询 HTTPS 记录并启用 ECH，避免明文 SNI 被阻断。
                参考 Total-ECH 方案。
              </p>
              <p className="text-ink-600">
                目标站点（next.bgm.tv / api.bgm.tv）走 Cloudflare，可受益；若网络本身拦截 TLS 则无效，此时请改用代理。
              </p>
              <label className="flex items-center justify-between gap-4 text-ink-300">
                <span>启用 DoH + ECH（关闭则仅直连）</span>
                <input
                  type="checkbox"
                  checked={settings.directDns}
                  onChange={(e) => onChange({ directDns: e.target.checked })}
                  className="h-4 w-4 accent-brand-500"
                />
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-200">常规</h2>
        <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-sm">
          <label className="flex items-center justify-between gap-4">
            <span className="text-ink-300">自动刷新间隔（分钟）</span>
            <input
              type="number"
              min={1}
              max={240}
              value={refreshMinutes}
              onChange={(e) => setRefreshMinutes(e.target.value)}
              onBlur={() => {
                const value = Math.max(1, Math.min(240, Number(refreshMinutes) || 15));
                setRefreshMinutes(String(value));
                onChange({ refreshMinutes: value });
              }}
              className="w-20 rounded-lg border border-ink-700 bg-ink-950 px-2 py-1 text-right outline-none focus:border-brand-500"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-ink-300">关闭窗口时最小化到托盘</span>
            <input
              type="checkbox"
              checked={settings.closeToTray}
              onChange={(e) => onChange({ closeToTray: e.target.checked })}
              className="h-4 w-4 accent-brand-500"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-ink-300">开机自动启动（静默到托盘）</span>
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(e) => onChange({ launchAtLogin: e.target.checked })}
              className="h-4 w-4 accent-brand-500"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-200">图片缓存</h2>
        <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-300">已缓存封面</span>
            <span className="tabular-nums text-ink-100">
              {cache ? `${cache.count} 张 · ${formatBytes(cache.bytes)}` : '统计中…'}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-500">
            看过的封面会自动缓存；超过 {cache?.ttlDays ?? 7} 天没有再显示的图片会在后台自动清理。
            {cache && cache.expired > 0 ? `当前有 ${cache.expired} 张已过期。` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => runCacheAction('expired')}
              disabled={cacheBusy}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ink-600 disabled:opacity-40"
            >
              清理过期缓存
            </button>
            <button
              onClick={() => runCacheAction('all')}
              disabled={cacheBusy}
              className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-400 disabled:opacity-40"
            >
              清空全部缓存
            </button>
            <button
              onClick={loadCache}
              disabled={cacheBusy}
              className="rounded-lg px-2 py-1.5 text-xs text-ink-500 transition hover:text-ink-200 disabled:opacity-40"
            >
              刷新统计
            </button>
            {cacheNote && <span className="text-xs text-ink-400">{cacheNote}</span>}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-200">主题</h2>
        <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-ink-500">明暗</span>
            {(
              [
                ['dark', '深色'],
                ['light', '浅色'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onChange({ theme: mode })}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  settings.theme === mode
                    ? 'bg-brand-500 text-white'
                    : 'border border-ink-700 text-ink-300 hover:border-ink-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-ink-500">强调色</span>
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                onClick={() => onChange({ accent: a.key })}
                title={a.label}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  settings.accent === a.key
                    ? 'border-ink-600 text-ink-100'
                    : 'border-ink-800 text-ink-400 hover:border-ink-600'
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: a.color }}
                  aria-hidden
                />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
