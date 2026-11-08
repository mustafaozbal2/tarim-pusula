import type { AnnouncementDto, InboxItemDto, TodayDto } from '../api/client';
import type { KV } from '../offline/kv';
import { buildNotifications, type NotificationRow } from '../today/notifications';

export interface NotificationItem extends NotificationRow {
  /** Okundu bilgisi için: aynı bildirim ertesi gün yeniden "okunmamış" olur. */
  key: string;
}

/** Kullanıcının gerçekte sahip olduğu şeyler: ilgisiz konudaki duyuru bildirim olmaz (MP-3b). */
export interface Ilgi {
  /** Hesapta drone cihazı var mı. */
  dron?: boolean;
}

const ORNEK_KAYNAK = /örnek veri|test verisi|\(demo\)/i;
const DRON = /\bdron(e|u|lar)?\b/i;

/**
 * Bildirime yalnız gerçek ve ilgili duyuru girer: demo/örnek kaynaklı duyurular bildirim olmaz; drone
 * konulu duyuru yalnız drone cihazı olan hesaba gider. (Duyurular Haberler sayfasında yine görünür.)
 */
export function bildirimeUygun(
  a: Pick<AnnouncementDto, 'title' | 'body' | 'sourceOrg'>,
  ilgi: Ilgi = {},
): boolean {
  if (a.sourceOrg && ORNEK_KAYNAK.test(a.sourceOrg)) return false;
  if (!ilgi.dron && DRON.test(`${a.title} ${a.body ?? ''}`)) return false;
  return true;
}

/** Bildirime dokununca gidilecek sayfa; null ise yalnız okundu sayılır. */
export function bildirimHedefi(id: string): string | null {
  if (id.startsWith('uzman-')) return '/sorularim';
  if (id.startsWith('duyuru-')) return '/haber';
  if (id === 'su') return '/sulama';
  if (['don', 'hava', 'sicaklik', 'yagis', 'et0'].includes(id)) return '/hava';
  return null;
}

const SEEN_KEY = 'notifications.seen.v1';
const SEEN_LIMIT = 200;

/**
 * Bildirim listesi: bugünkü olgular + onaylı duyurular + sunucu bildirim kutusu (uzman cevabı, G24).
 * Onaysız duyuru ve onaysız bilgi hiç girmez (değişmez kural 1).
 */
export function notificationItems(
  today: TodayDto | null,
  announcements: AnnouncementDto[],
  inbox: InboxItemDto[] = [],
  ilgi: Ilgi = {},
): NotificationItem[] {
  const rows: NotificationRow[] = [
    ...(today ? buildNotifications(today) : []),
    ...announcements
      .filter((a) => !a.needsBadge && bildirimeUygun(a, ilgi))
      .map((a) => ({
        id: `duyuru-${a.id}`,
        date: a.publishedAt,
        title: a.title,
        tone: 'normal' as const,
      })),
    ...inbox.map((n) => ({
      id: `${n.kind === 'uzman_cevap' ? 'uzman' : n.kind}-${n.id}`,
      date: n.createdAt,
      title: n.title,
      tone: 'normal' as const,
    })),
  ];
  return rows.map((r) => ({ ...r, key: `${r.id}@${r.date.slice(0, 10)}` }));
}

export function unreadCount(items: NotificationItem[], seen: readonly string[]): number {
  const s = new Set(seen);
  return items.filter((i) => !s.has(i.key)).length;
}

/** Görülenlere ekler; yalnız en son SEEN_LIMIT anahtar tutulur. */
export function mergeSeen(seen: readonly string[], items: NotificationItem[]): string[] {
  const out = [...seen];
  for (const i of items) if (!out.includes(i.key)) out.push(i.key);
  return out.slice(-SEEN_LIMIT);
}

export async function loadSeen(kv: KV): Promise<string[]> {
  const raw = await kv.get(SEEN_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function markAllSeen(kv: KV, items: NotificationItem[]): Promise<string[]> {
  const next = mergeSeen(await loadSeen(kv), items);
  await kv.set(SEEN_KEY, JSON.stringify(next));
  return next;
}

/** Tek bildirimi okundu sayar. */
export async function markSeen(kv: KV, item: NotificationItem): Promise<string[]> {
  return markAllSeen(kv, [item]);
}
