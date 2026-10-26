import { NetworkError } from '../api/client';
import type {
  Api,
  AnnouncementDto,
  CalendarDto,
  FieldDto,
  OrnekIcerikDto,
  SupportMatchDto,
} from '../api/client';
import type { KV } from '../offline/kv';
import { loadAnnouncements } from '../today/announcements';
import { FIELDS_CACHE, loadToday, type TodayResult } from '../today/load';

export interface HomeData {
  base: TodayResult;
  fields: FieldDto[];
  calendar: CalendarDto | null;
  supports: SupportMatchDto[];
  announcements: AnnouncementDto[];
  /** Demo örnek içeriği (yalnız demo sunucusu verir; gerçek modda uç yoktur → null). */
  sample: OrnekIcerikDto | null;
}

const calKey = (id: string) => `cache.home.calendar.v1.${id}`;
const supKey = (id: string) => `cache.home.supports.v1.${id}`;
const ornekKey = (cropId: string) => `cache.home.ornek.v1.${cropId}`;

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
 * Demo örnek içeriği. Sunucu "yok" derse (gerçek mod: 404) önbellek de silinir; böylece demo'dan gerçek
 * sunucuya geçen telefonda eski örnek veri görünmez. Yalnız ağ hatasında son önbellek kullanılır.
 */
async function loadSample(
  fetcher: (cropId: string) => Promise<OrnekIcerikDto>,
  kv: KV,
  cropId: string,
): Promise<OrnekIcerikDto | null> {
  try {
    const v = await fetcher(cropId);
    await kv.set(ornekKey(cropId), JSON.stringify(v));
    return v;
  } catch (e) {
    if (!(e instanceof NetworkError)) {
      await kv.remove(ornekKey(cropId));
      return null;
    }
    const raw = await kv.get(ornekKey(cropId));
    return raw ? (JSON.parse(raw) as OrnekIcerikDto) : null;
  }
}

/**
 * Ana sayfa verisi: seçili arazi (Bugün ile aynı seçim), takvim, destekler, duyurular.
 * Yan veriler başarısız olursa son önbellek ya da boş liste; ana sayfa yine açılır.
 * Arazi yoksa (ya da konumsuzsa) null.
 */
export async function loadHome(
  api: Pick<Api, 'fields' | 'today' | 'calendar' | 'supports' | 'announcements'> &
    Partial<Pick<Api, 'ornekIcerik'>>,
  kv: KV,
  pick?: string,
): Promise<HomeData | null> {
  const base = await loadToday(api, kv, pick);
  if (!base) return null;
  const id = base.field.id;
  const cropId = base.field.cropId;
  const [calendar, supports, announcements, sample] = await Promise.all([
    cached<CalendarDto | null>(kv, calKey(id), () => api.calendar(id, 90), null),
    cached<SupportMatchDto[]>(kv, supKey(id), async () => (await api.supports(id)).matches, []),
    loadAnnouncements(api, kv, id),
    // Ürün seçilmemiş arazide genel örnek içerik (G23.8).
    api.ornekIcerik ? loadSample(api.ornekIcerik, kv, cropId ?? 'genel') : Promise.resolve(null),
  ]);
  const raw = await kv.get(FIELDS_CACHE);
  const fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [base.field];
  return { base, fields, calendar, supports, announcements, sample };
}
