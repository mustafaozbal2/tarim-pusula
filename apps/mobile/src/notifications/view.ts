import type { IconName } from '../components/Icon';
import type { NotificationItem } from './state';

export type NotificationGroup = { title: string; items: NotificationItem[] };

const DAY = 86_400_000;
const dayStart = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

/** Bildirimleri "Bugün", "Bu hafta", "Daha önce" diye gruplar; her grup yeniden eskiye (saf; testli). */
export function groupNotifications(
  items: NotificationItem[],
  todayIso: string,
): NotificationGroup[] {
  const t0 = dayStart(todayIso);
  const groups: NotificationGroup[] = [
    { title: 'Bugün', items: [] },
    { title: 'Bu hafta', items: [] },
    { title: 'Daha önce', items: [] },
  ];
  for (const i of items) {
    const age = Math.round((t0 - dayStart(i.date)) / DAY);
    groups[age <= 0 ? 0 : age < 7 ? 1 : 2]!.items.push(i);
  }
  for (const g of groups) g.items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return groups.filter((g) => g.items.length > 0);
}

/** Bildirimin türüne göre ikon ve renk: don uyarısı kehribar, su mavisi, duyuru turkuaz. */
export function notificationLook(id: string, tone: string): { icon: IconName; kind: string } {
  if (tone === 'warning' || id.startsWith('don')) return { icon: 'warning', kind: 'uyari' };
  if (id.startsWith('su') || id.startsWith('yagis') || id.startsWith('et0'))
    return { icon: 'drop', kind: 'su' };
  if (id.startsWith('duyuru-')) return { icon: 'book', kind: 'duyuru' };
  return { icon: 'sun', kind: 'hava' };
}
