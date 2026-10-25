import type { Api, AnnouncementDto, CalendarDto, FieldDto, SupportMatchDto } from '../api/client';
import type { KV } from '../offline/kv';
import { loadAnnouncements } from '../today/announcements';
import { FIELDS_CACHE, loadToday, type TodayResult } from '../today/load';

export interface HomeData {
  base: TodayResult;
  fields: FieldDto[];
  calendar: CalendarDto | null;
  supports: SupportMatchDto[];
  announcements: AnnouncementDto[];
}

const calKey = (id: string) => `cache.home.calendar.v1.${id}`;
const supKey = (id: string) => `cache.home.supports.v1.${id}`;

async function cached<T>(kv: KV, key: string, fetcher: () => Promise<T>, empty: T): Promise<T> {
  try {
    const v = await fetcher();
    await kv.set(key, JSON.stringify(v));
    return v;
  } catch {
    const raw = await kv.get(key);
    return raw ? (JSON.parse(raw) as T) : empty;
  }
}

/**
 * Ana sayfa verisi: seçili arazi (Bugün ile aynı seçim), takvim, destekler, duyurular.
 * Yan veriler başarısız olursa son önbellek ya da boş liste; ana sayfa yine açılır.
 * Arazi yoksa (ya da konumsuzsa) null.
 */
export async function loadHome(
  api: Pick<Api, 'fields' | 'today' | 'calendar' | 'supports' | 'announcements'>,
  kv: KV,
  pick?: string,
): Promise<HomeData | null> {
  const base = await loadToday(api, kv, pick);
  if (!base) return null;
  const id = base.field.id;
  const [calendar, supports, announcements] = await Promise.all([
    cached<CalendarDto | null>(kv, calKey(id), () => api.calendar(id, 90), null),
    cached<SupportMatchDto[]>(kv, supKey(id), async () => (await api.supports(id)).matches, []),
    loadAnnouncements(api, kv, id),
  ]);
  const raw = await kv.get(FIELDS_CACHE);
  const fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [base.field];
  return { base, fields, calendar, supports, announcements };
}
