import { tr } from './i18n/tr';

/** Sekme sırası: Bugün · Tarlalarım · Soru sor · Pazar (docs/UX_KURALLARI.md). */
export const TABS = [
  { route: 'index', label: tr.tabs.today, icon: 'sun' },
  { route: 'tarlalarim', label: tr.tabs.fields, icon: 'map' },
  { route: 'soru-sor', label: tr.tabs.ask, icon: 'spark' },
  { route: 'pazar', label: tr.tabs.market, icon: 'chart' },
] as const;

export type TabIcon = (typeof TABS)[number]['icon'];
