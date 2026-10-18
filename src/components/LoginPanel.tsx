import { useEffect, useState } from 'react';
import type { LoginProgress, LoginResult, Settings } from '../../electron/shared/types';
import { proxyModeLabel } from '../lib/format';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onRefresh: () => void;
}

export function LoginPanel({ settings, onChange, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [proxyInfo, setProxyInfo] = useState('检测中…');
  const [rules, setRules] = useState(settings.proxyRules);

  useEffect(() => {
    window.api.proxy
      .test()
      .then((r) => setProxyInfo(r))
      .catch(() => setProxyInfo('未知'));
  }, [settings.proxyMode, settings.proxyRules]);

  // 主进程推送的登录进度（内嵌窗口登录期间）
  useEffect(() => {
    const off = window.api.on.loginProgress((p: LoginProgress) => {
      if (p.phase === 'opened') setMessage('已打开登录窗口，请在窗口中完成登录…');
      else if (p.phase === 'waiting') setMessage('检测到登录状态，正在读取凭据…');
      else if (p.phase === 'verifying') setMessage('正在校验账号信息…');
    });
    return () => {
      off();
    };
  }, []);

  const loginWeb = async () => {
    setBusy(true);
    setMessage('已打开登录窗口，请完成登录；成功后窗口会自动关闭。');
    try {
      const res: LoginResult = await window.api.auth.loginWeb();
      setMessage(res.ok ? `登录成功：${res.userName ?? ''}` : `登录失败：${res.error ?? '未知错误'}`);
      if (res.ok) {
        onRefresh();
        setTokenOpen(false);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  const loginToken = async () => {
    if (!token.trim()) return;
    setBusy(true);
    try {
      const res = await window.api.auth.loginToken(token.trim());
      setMessage(res.ok ? `登录成功：${res.userName ?? ''}` : `Token 无效：${res.error ?? ''}`);
      if (res.ok) {
        setToken('');
        setTokenOpen(false);
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await window.api.auth.logout();
      setMessage('已退出登录');
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-200">账号</h2>
        {settings.loggedIn && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
            {settings.tokenSource === 'manual' ? 'Token 登录' : '网页登录'}
          </span>
        )}
      </header>

      {settings.loggedIn ? (
        <div className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-3">
          {settings.avatar ? (
            <img src={settings.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-ink-700" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{settings.userName ?? '已登录'}</p>
            <p className="text-xs text-ink-500">UID {settings.userId ?? '-'}</p>
          </div>
          <button
            onClick={logout}
            disabled={busy}
            className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ink-600 hover:text-ink-100 disabled:opacity-50"
          >
            退出登录
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <p className="text-sm text-ink-300">
            在应用内的窗口里登录 next.bgm.tv，登录完成后自动读取登录态，收藏与进度随即同步。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void loginWeb()}
              disabled={busy}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? '登录中…' : '打开登录窗口'}
            </button>
            <button
              onClick={() => setTokenOpen((v) => !v)}
              className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-ink-600 hover:text-ink-100"
            >
              使用 Token 登录
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-xs text-ink-400">{message}</p>}

      {tokenOpen && !settings.loggedIn && (
        <div className="space-y-2 rounded-xl border border-ink-800 bg-ink-900/40 p-3">
          <p className="text-xs text-ink-400">手动粘贴 Access Token（备用登录方式）</p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="粘贴 Access Token"
            className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <p className="text-xs text-ink-500">Token 会在本机加密保存，仅用于调用 api.bgm.tv。</p>
          <button
            onClick={() => void loginToken()}
            disabled={busy || !token.trim()}
            className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm transition hover:bg-ink-700 disabled:opacity-50"
          >
            保存并验证
          </button>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink-300">网络代理</h3>
          <span className="text-xs text-ink-500">{proxyModeLabel(settings.proxyMode)}</span>
        </div>
        <div className="flex gap-2">
          {(
            [
              ['system', '跟随系统'],
              ['direct', '直连'],
              ['manual', '自定义'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => onChange({ proxyMode: mode })}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                settings.proxyMode === mode
                  ? 'bg-brand-500 text-white'
                  : 'border border-ink-700 text-ink-300 hover:border-ink-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {settings.proxyMode === 'manual' && (
          <div className="flex gap-2">
            <input
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              onBlur={() => onChange({ proxyRules: rules.trim() })}
              placeholder="http://127.0.0.1:7890"
              className="flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <button
              onClick={() => onChange({ proxyRules: rules.trim() })}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300"
            >
              应用
            </button>
          </div>
        )}
        <p className="text-xs text-ink-500">当前解析：{proxyInfo}</p>
      </div>
    </section>
  );
}
