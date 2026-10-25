import type { AnnouncementDto, TodayDto } from '../api/client';
import type { KV } from '../offline/kv';
import { buildNotifications, type NotificationRow } from '../today/notifications';

export interface NotificationItem extends NotificationRow {
  /** Okundu bilgisi için: aynı bildirim ertesi gün yeniden "okunmamış" olur. */
  key: string;
}

const SEEN_KEY = 'notifications.seen.v1';
const SEEN_LIMIT = 200;

/**
 * Bildirim listesi: bugünkü olgular + onaylı duyurular. Onaysız duyuru ve onaysız bilgi hiç
 * girmez (değişmez kural 1).
 */
export function notificationItems(
  today: TodayDto | null,
  announcements: AnnouncementDto[],
): NotificationItem[] {
  const rows: NotificationRow[] = [
    ...(today ? buildNotifications(today) : []),
    ...announcements
      .filter((a) => !a.needsBadge)
      .map((a) => ({
        id: `duyuru-${a.id}`,
        date: a.publishedAt,
        title: a.title,
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
