import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../electron/shared/types';

const fallback: Settings = {
  proxyMode: 'system',
  directDns: true,
  proxyRules: '',
  refreshMinutes: 15,
  theme: 'dark',
  accent: 'pink',
  closeToTray: true,
  launchAtLogin: false,
  loggedIn: false,
  tokenSource: null,
  seasonYear: new Date().getFullYear(),
  seasonQuarter: (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  seasonSort: 'score',
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.api.settings
      .get()
      .then((s) => setSettings(s))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (patch: Partial<Settings>) => {
    const next = await window.api.settings.save(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, setSettings, save, loaded };
}
