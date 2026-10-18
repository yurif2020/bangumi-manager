import type { CollectionType } from '../../electron/shared/types';

export type ViewKey = 'doing' | 'wish' | 'collect' | 'onhold' | 'dropped' | 'search' | 'index' | 'settings';

export const VIEW_TO_TYPE: Partial<Record<ViewKey, CollectionType>> = {
  doing: 3,
  wish: 1,
  collect: 2,
  onhold: 4,
  dropped: 5,
};

export interface NavItem {
  key: ViewKey;
  label: string;
  dot: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'doing', label: '在看', dot: 'bg-emerald-400' },
  { key: 'wish', label: '想看', dot: 'bg-sky-400' },
  { key: 'collect', label: '看过', dot: 'bg-violet-400' },
  { key: 'onhold', label: '搁置', dot: 'bg-amber-400' },
  { key: 'dropped', label: '抛弃', dot: 'bg-rose-400' },
];
