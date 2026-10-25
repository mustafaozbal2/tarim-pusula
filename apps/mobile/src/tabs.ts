import { tr } from './i18n/tr';

/** Alt çubuk kaldırıldı (G19); bu liste yalnız rotaları kaydeder: Bugün · Arazilerim · Soru sor · Pazar. */
export const TABS = [
  { route: 'index', label: tr.tabs.today, icon: 'sun' },
  { route: 'tarlalarim', label: tr.tabs.fields, icon: 'map' },
  { route: 'soru-sor', label: tr.tabs.ask, icon: 'spark' },
  { route: 'pazar', label: tr.tabs.market, icon: 'chart' },
] as const;

export type TabIcon = (typeof TABS)[number]['icon'];
