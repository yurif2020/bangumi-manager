import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CollectionItem, CollectionType, Subject, SyncState, WatchedEvent } from '../electron/shared/types';
import { Sidebar } from './components/Sidebar';
import { SearchBox } from './components/SearchBox';
import { SubjectDetail } from './components/SubjectDetail';
import { SearchView } from './views/SearchView';
import { SettingsView } from './views/SettingsView';
import { LibraryView } from './views/LibraryView';
import { SeasonView } from './views/SeasonView';
import { useSettings } from './hooks/useSettings';
import { useCollections } from './hooks/useCollections';
import { useEpisodeActions } from './hooks/useEpisodeActions';
import { useToast } from './hooks/useToast';
import type { ViewKey } from './lib/views';
import { VIEW_TO_TYPE } from './lib/views';
import { subjectTitle } from './lib/format';

const VIEW_TITLE: Record<ViewKey, string> = {
  doing: '在看',
  wish: '想看',
  collect: '看过',
  onhold: '搁置',
  dropped: '抛弃',
  search: '搜索',
  index: '季度索引',
  settings: '设置',
};

export function App() {
  const { settings, setSettings, save } = useSettings();
  const toast = useToast();
  const [view, setView] = useState<ViewKey>('doing');
  const [keyword, setKeyword] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<Subject | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);

  const onError = useCallback((msg: string) => toast.push('error', msg), [toast]);

  const { collections, loading, applyLocal, bumpProgress } = useCollections({
    refreshKey,
    userKey: settings.loggedIn ? settings.userId ?? settings.userName : undefined,
    onError,
  });

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const actions = useEpisodeActions({ toast: toast.push, refresh, bumpProgress });

  /* -------------------------- 主题与快捷键 -------------------------- */

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.body.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent ?? 'pink';
    document.body.dataset.accent = settings.accent ?? 'pink';
  }, [settings.theme, settings.accent]);

  /* -------------------------- 主进程事件 -------------------------- */

  useEffect(() => {
    const offWatched = window.api.on.watchedIncoming((ev: WatchedEvent) => {
      const label = ev.ep ? `第 ${ev.ep} 集` : '剧集';
      toast.push('success', `已记录：${ev.subjectId ? `番剧 #${ev.subjectId} ` : ''}${label} 已看`);
      refresh();
    });
    const offToast = window.api.on.toast((msg) => toast.push(msg.kind, msg.text));
    const offRefresh = window.api.on.refreshRequested(() => refresh());
    const offSync = window.api.on.syncChanged((state) => setSyncState(state));
    void window.api.sync.status().then(setSyncState).catch(() => undefined);
    return () => {
      offWatched();
      offToast();
      offRefresh();
      offSync();
    };
  }, [toast, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh]);

  /* -------------------------- 派生数据 -------------------------- */

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const item of collections) {
      const key = Object.entries(VIEW_TO_TYPE).find(([, t]) => t === item.type)?.[0];
      if (key) c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [collections]);

  const currentType = VIEW_TO_TYPE[view];
  const listItems = useMemo(
    () => (currentType ? collections.filter((c) => c.type === currentType) : []),
    [collections, currentType],
  );

  const itemOf = useCallback(
    (subjectId: number): CollectionItem | undefined => collections.find((c) => c.subjectId === subjectId),
    [collections],
  );

  const collect = useCallback(
    async (subject: Subject, type: CollectionType | 0) => {
      const existing = itemOf(subject.id);
      // 乐观更新
      if (type === 0) applyLocal(subject, 0);
      else applyLocal(subject, type);
      const res = await actions.setCollection(subject, type, existing);
      if (!res.ok) {
        // 取消/失败则回滚到原状态
        if (existing) applyLocal(existing.subject ?? subject, existing.type);
        else applyLocal(subject, 0);
        return;
      }
      if (type === 0) toast.push('info', '已取消收藏');
      else toast.push('success', `已加入「${['', '想看', '看过', '在看', '搁置', '抛弃'][type]}」`);
      refresh();
    },
    [itemOf, applyLocal, actions, toast, refresh],
  );

  /** 列表里的「下一集 +1」：先本地加速定位，再写入 */
  const markNextFromList = useCallback(
    async (item: CollectionItem) => {
      const subject = item.subject;
      if (!subject) return;
      const bundle = await window.api.subject.episodes(subject.id).catch(() => null);
      if (!bundle) {
        toast.push('error', '拉取章节失败');
        return;
      }
      const watched = new Set(bundle.watched);
      const done = await actions.markNext(subject.id, bundle.episodes, watched);
      if (done) refresh();
    },
    [actions, toast, refresh],
  );

  const manualSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await window.api.sync.flush();
      refresh();
      toast.push(res.pending === 0 ? 'success' : 'info', res.pending === 0 ? '已全部同步' : `${res.pending} 项待重试`);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }, [refresh, toast]);

  const onSearchChange = useCallback((v: string) => {
    setKeyword(v);
    if (v.trim()) setView('search');
  }, []);

  const title = VIEW_TITLE[view];
  const queueSize = syncState?.queueSize ?? 0;

  return (
    <div className="flex h-screen bg-ink-950 text-ink-100">
      <Sidebar
        current={view}
        counts={counts}
        userName={settings.userName}
        avatar={settings.avatar}
        loggedIn={settings.loggedIn}
        queueSize={queueSize}
        onChange={(v) => {
          setView(v);
          if (v !== 'search') setKeyword('');
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-800/80 px-4">
          <SearchBox
            value={keyword}
            onChange={onSearchChange}
            placeholder={view === 'search' ? '搜索番剧…' : '搜索番剧（Ctrl + K）'}
            onSubmit={() => setView('search')}
          />
          <span className="hidden shrink-0 text-xs text-ink-500 sm:block">{title}</span>
          <button
            onClick={() => void manualSync()}
            disabled={syncing || !settings.loggedIn}
            className="shrink-0 rounded-xl border border-ink-800 px-3 py-2 text-xs text-ink-300 transition hover:border-ink-700 hover:text-ink-100 disabled:opacity-40"
            title={queueSize ? `${queueSize} 项待同步` : '立即同步'}
          >
            {syncing ? '同步中…' : queueSize ? `同步（${queueSize}）` : '同步'}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {view === 'search' ? (
            <SearchView
              keyword={keyword}
              collections={collections}
              onCollect={(s, t) => void collect(s, t)}
              onOpen={setDetail}
            />
          ) : view === 'settings' ? (
            <SettingsView
              settings={settings}
              onChange={(patch) => {
                void save(patch).then((s) => setSettings(s));
              }}
              onRefresh={refresh}
            />
          ) : view === 'index' ? (
            <SeasonView
              settings={settings}
              onSettings={save}
              collections={collections}
              onCollect={(s, t) => void collect(s, t as CollectionType)}
              onOpen={setDetail}
            />
          ) : currentType ? (
            settings.loggedIn ? (
              <LibraryView
                items={listItems}
                loading={loading}
                title={title}
                emptyText={`「${title}」列表还是空的`}
                onOpen={setDetail}
                onMarkNext={markNextFromList}
                onRemove={(subject) => void collect(subject, 0)}
                busy={actions.busy}
              />
            ) : (
              <LoginPrompt onGo={() => setView('settings')} />
            )
          ) : (
            <LoginPrompt onGo={() => setView('settings')} />
          )}
        </div>
      </main>

      {detail && (
        <SubjectDetail
          subject={detail}
          item={itemOf(detail.id)}
          onClose={() => setDetail(null)}
          actions={actions}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function LoginPrompt({ onGo }: { onGo: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-3xl">🔑</div>
      <p className="text-sm text-ink-300">还没有登录 Bangumi</p>
      <p className="max-w-xs text-xs text-ink-500">
        在应用内登录 Bangumi 后，收藏与进度会自动读取，并支持随时改状态、推进集数。
      </p>
      <button
        onClick={onGo}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
      >
        去登录
      </button>
    </div>
  );
}
