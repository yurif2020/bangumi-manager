import Store from 'electron-store';
import type { AccentColor, ProxyMode, Settings } from '../shared/types';

export interface PersistedSettings {
  proxyMode: ProxyMode;
  directDns: boolean;
  proxyRules: string;
  refreshMinutes: number;
  theme: 'dark' | 'light';
  accent: AccentColor;
  closeToTray: boolean;
  launchAtLogin: boolean;
  seasonYear: number;
  seasonQuarter: 1 | 2 | 3 | 4;
  seasonSort: 'score' | 'heat' | 'rank';
}

const now = new Date();
const defaultSeason = {
  year: now.getFullYear(),
  quarter: (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
};

export const store = new Store<PersistedSettings>({
  name: 'settings',
  defaults: {
    proxyMode: 'system',
    directDns: true,
    proxyRules: '',
    refreshMinutes: 15,
    theme: 'dark',
    accent: 'pink',
    closeToTray: true,
    launchAtLogin: false,
    seasonYear: defaultSeason.year,
    seasonQuarter: defaultSeason.quarter,
    seasonSort: 'score',
  },
});

export function readSettings(): PersistedSettings {
  return store.store;
}

export function patchSettings(patch: Partial<PersistedSettings>): PersistedSettings {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) store.set(k as keyof PersistedSettings, v as never);
  }
  return store.store;
}

/** 合并凭据状态给渲染层（不含凭据本身） */
export function toPublicSettings(
  extra: Pick<Settings, 'loggedIn' | 'userName' | 'userId' | 'avatar' | 'tokenSource'>,
): Settings {
  return { ...store.store, ...extra };
}
