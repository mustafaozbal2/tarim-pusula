import { NetworkError } from '../api/client';
import type {
  Api,
  AnnouncementDto,
  CalendarDto,
  FieldDto,
  OrnekIcerikDto,
  SupportMatchDto,
  TodayDto,
} from '../api/client';
import { normalizeTr } from '@tarim/agro-core';
import type { KV } from '../offline/kv';
import { announcementsKey, loadAnnouncements } from '../today/announcements';
import type { DigerArazi } from './model';
import { FIELDS_CACHE, SELECTED, loadToday, todayKey, type TodayResult } from '../today/load';

export interface HomeData {
  base: TodayResult;
  fields: FieldDto[];
  calendar: CalendarDto | null;
  supports: SupportMatchDto[];
  announcements: AnnouncementDto[];
  /** Demo örnek içeriği (yalnız demo sunucusu verir; gerçek modda uç yoktur → null). */
  sample: OrnekIcerikDto | null;
  /** Diğer araziler (seçili olmayan): işleri, uyarıları; duyuruları zaten `announcements` içinde. */
  digerleri: DigerArazi[];
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
  // Diğer araziler (en çok 7): çiftçi arazi değiştirmeden tüm arazilerinin haberini, işini, uyarısını görür.
  const digerFields = fields
    .filter((f) => f.id !== id && f.lat !== null && f.lon !== null)
    .slice(0, 7);
  const diger = await Promise.all(
    digerFields.map(async (f) => {
      const [cal, anns, today] = await Promise.all([
        cached<CalendarDto | null>(kv, calKey(f.id), () => api.calendar(f.id, 90), null),
        loadAnnouncements(api, kv, f.id),
        cached<TodayDto | null>(kv, `cache.home.today.v1.${f.id}`, () => api.today(f.id), null),
      ]);
      return { arazi: { ad: f.name, today, calendar: cal } satisfies DigerArazi, anns };
    }),
  );
  // Aynı başlıklı haber farklı illerin müdürlüklerinden ayrı kayıt olarak gelebilir (ör. Bir Sürü Olsun): tek kart.
  const gorulen = new Set<string>();
  const tumDuyurular: AnnouncementDto[] = [];
  for (const a of [...announcements, ...diger.flatMap((d) => d.anns)]) {
    const baslik = normalizeTr(a.title);
    if (gorulen.has(a.id) || gorulen.has(baslik)) continue;
    gorulen.add(a.id);
    gorulen.add(baslik);
    tumDuyurular.push(a);
  }
  tumDuyurular.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return {
    base,
    fields,
    calendar,
    supports,
    announcements: tumDuyurular,
    sample,
    digerleri: diger.map((d) => d.arazi),
  };
}

/**
 * Soğuk açılışta ANINDA gösterilecek son ana sayfa verisi (TP-T1): sunucu uyanana kadar (ücretsiz planda ~20 sn)
 * iskelet yerine son bilinen tarla, hava, takvim ve duyurular görünür; arkada tazelenir. Önbellek yoksa
 * (ilk kurulum) null döner ve iskelet gösterilir. `offline` işaretlenmez: veri eski olabilir ama "internet yok"
 * uyarısı çıkmaz; tazelenince yerini gerçek veri alır.
 */
export async function loadHomeCache(kv: KV): Promise<HomeData | null> {
  try {
    const raw = await kv.get(FIELDS_CACHE);
    if (!raw) return null;
    const fields = (JSON.parse(raw) as { fields: FieldDto[] }).fields.filter(
      (f) => f.lat !== null && f.lon !== null,
    );
    if (fields.length === 0) return null;
    const secili = await kv.get(SELECTED);
    const field = fields.find((f) => f.id === secili) ?? fields[0]!;
    const t = await kv.get(todayKey(field.id));
    if (!t) return null;
    const c = JSON.parse(t) as { at: string; today: TodayResult['today'] };
    const read = async <T>(key: string, empty: T): Promise<T> => {
      const v = await kv.get(key);
      return v ? (JSON.parse(v) as T) : empty;
    };
    return {
      base: { field, today: c.today, at: c.at, offline: false },
      fields,
      calendar: await read<CalendarDto | null>(calKey(field.id), null),
      supports: await read<SupportMatchDto[]>(supKey(field.id), []),
      announcements: await read<AnnouncementDto[]>(announcementsKey(field.id), []),
      sample: null,
      digerleri: [],
    };
  } catch {
    return null;
  }
}
