import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  type AnnouncementDto,
  type FieldDto,
  type MarketDto,
  type NdviDto,
  type TodayDto,
} from './api/client';
import { loadMarket } from './market/load';
import { loadNdvi } from './ndvi/load';
import { bars, latestPoint, skippedText, sourceLine, trendText, valueText } from './ndvi/model';
import { MemoryKV } from './offline/kv';
import { OfflineQueue } from './offline/queue';
import { loadAnnouncements } from './today/announcements';
import { loadToday } from './today/load';

const field = (id: string): FieldDto => ({
  id,
  name: `Tarla ${id}`,
  province: 'Gaziantep',
  district: null,
  village: null,
  lat: 37,
  lon: 37,
  areaDecare: 20,
  cropId: 'antep-fistigi',
  locationSource: 'gps',
  clientId: null,
});

const series = (over: Partial<Extract<NdviDto, { kind: 'series' }>> = {}): NdviDto => ({
  kind: 'series',
  fieldId: 'a',
  fieldName: 'Tarla a',
  points: [
    { from: '2026-09-07', to: '2026-09-14', mean: 0.66, validFraction: 1 },
    { from: '2026-09-14', to: '2026-09-21', mean: 0.62, validFraction: 0.75 },
    { from: '2026-10-05', to: '2026-10-12', mean: 0.41, validFraction: 1 },
  ],
  skipped: 2,
  trend: { kind: 'drop', latest: 0.41, baseline: 0.64, drop: 0.23, date: '2026-10-05' },
  source: {
    name: 'Copernicus Sentinel-2 L2A',
    version: 'statistical-v1@2026-10-20',
    date: '2026-10-20',
  },
  fetchedAt: '2026-10-20T09:00:00Z',
  stale: false,
  sample: false,
  needsBadge: true,
  ...over,
});

describe('NDVI grafik modeli', () => {
  it('çubuk yüksekliği değerin kendisi (0-1 kırpılı), etiket Türkçe', () => {
    const s = series() as Extract<NdviDto, { kind: 'series' }>;
    expect(bars(s).map((b) => b.height)).toEqual([0.66, 0.62, 0.41]);
    expect(bars(s)[0]).toMatchObject({ label: '7 Eylül 2026', value: '0,66' });
    const neg = series({
      points: [{ from: '2026-09-07', to: '2026-09-14', mean: -0.2, validFraction: 1 }],
    }) as Extract<NdviDto, { kind: 'series' }>;
    expect(bars(neg)[0]!.height).toBe(0);
  });
  it('metinler: değer, bulut, düşüş (puan), son ölçüm', () => {
    const s = series() as Extract<NdviDto, { kind: 'series' }>;
    expect(valueText(0.6234)).toBe('0,62');
    expect(skippedText(s)).toBe('2 haftada bulut vardı, o haftalar gösterilmiyor.');
    expect(skippedText({ ...s, skipped: 0 })).toBeNull();
    expect(trendText(s)).toMatchObject({ tone: 'warn' });
    expect(trendText(s).body).toContain('23 puan');
    expect(trendText({ ...s, trend: { kind: 'unknown', reason: 'yetersiz-veri' } }).tone).toBe(
      'info',
    );
    expect(latestPoint(s)).toEqual({ value: '0,41', date: '5 Ekim 2026' });
  });
  it('künyesi eksik seri kaynak satırı üretmez (ekran göstermez)', () => {
    const s = series() as Extract<NdviDto, { kind: 'series' }>;
    expect(sourceLine(s)).toBe(
      'Copernicus Sentinel-2 L2A · 20 Ekim 2026 · statistical-v1@2026-10-20',
    );
    expect(sourceLine({ ...s, source: { ...s.source, version: '' } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Tam çevrimdışı senaryo: önce çevrimiçi açılır (önbellek dolar), sonra bağlantı kesilir.

const todayDto = (id: string): TodayDto => ({
  fieldId: id,
  fieldName: `Tarla ${id}`,
  generatedAt: '2026-10-20T09:00:00Z',
  weather: {
    source: 'Open-Meteo',
    fetchedAt: '2026-10-20T09:00:00Z',
    stale: false,
    elevationM: 800,
    current: { tempC: 12, weatherCode: 2 },
    today: { date: '2026-10-20', tMinC: 8, tMaxC: 22, precipMm: 0 },
  },
  et0: { mmPerDay: 2.5, method: 'FAO-56 Penman-Monteith' },
  waterNeed: { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true },
  frost: {
    assessment: { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true },
    date: null,
    dayOffset: null,
    stageName: null,
    unavailable: false,
    source: 'Open-Meteo',
    fetchedAt: '2026-10-20T09:00:00Z',
  },
});
const announcement: AnnouncementDto = {
  id: 'd1',
  sourceOrg: 'İl Tarım Müdürlüğü',
  title: 'Budama zamanı',
  body: 'Bu hafta budama yapılabilir.',
  sourceUrl: null,
  publishedAt: '2026-10-19',
  needsBadge: false,
  why: 'Gaziantep, Antep fıstığı',
};
const market: MarketDto = {
  cropId: 'antep-fistigi',
  cropName: 'Antep fıstığı',
  current: null,
  places: [],
  national: [],
};

function onlineApi() {
  return {
    fields: async () => [field('a'), field('b')],
    today: async (id: string) => todayDto(id),
    announcements: async () => ({ announcements: [announcement] }),
    marketCrops: async () => [{ id: 'antep-fistigi', name: 'Antep fıstığı' }],
    marketPrices: async () => market,
    ndvi: async () => series(),
  };
}
const offlineApi = (): typeof onlineApi extends () => infer R ? R : never => {
  const down = async (): Promise<never> => {
    throw new NetworkError();
  };
  return {
    fields: down,
    today: down,
    announcements: down,
    marketCrops: down,
    marketPrices: down,
    ndvi: down,
  };
};

describe('tam çevrimdışı senaryo', () => {
  it('bağlantı kesilince hava, duyuru, pazar ve yeşillik son önbellekten gelir', async () => {
    const kv = new MemoryKV();
    const on = onlineApi();
    // Çevrimiçi açılış: önbellekler dolar.
    const t1 = await loadToday(on, kv);
    expect(t1?.offline).toBe(false);
    await loadAnnouncements(on, kv, 'a');
    await loadMarket(on, kv);
    const n1 = await loadNdvi(on, kv);
    expect(n1?.offline).toBe(false);

    // Bağlantı kesildi.
    const off = offlineApi();
    const t2 = await loadToday(off, kv);
    expect(t2).toMatchObject({ offline: true, field: { id: 'a' } });
    expect(t2?.today.weather.today.tMaxC).toBe(22);
    expect(t2?.at).toBe(t1?.at); // "son güncelleme" saati eski veriyi gösterir
    expect(await loadAnnouncements(off, kv, 'a')).toEqual([announcement]);
    const m = await loadMarket(off, kv);
    expect(m).toMatchObject({ offline: true, cropId: 'antep-fistigi' });
    const n2 = await loadNdvi(off, kv);
    expect(n2?.offline).toBe(true);
    expect(n2?.data).toEqual(series());
    expect(n2?.at).toBe(n1?.at);
  });

  it('hiç önbellek yokken yeşillik hata verir, tarla yoksa null döner', async () => {
    const off = offlineApi();
    expect(await loadNdvi(off, new MemoryKV())).toBeNull();
    const kv = new MemoryKV();
    await loadNdvi({ ...onlineApi(), ndvi: async () => series() }, kv, 'b'); // tarla b seçilir
    await kv.remove('cache.ndvi.v1.b');
    await expect(loadNdvi(off, kv)).rejects.toThrow();
  });

  it('tarla başına ayrı önbellek; seçim hatırlanır', async () => {
    const kv = new MemoryKV();
    const api = {
      ...onlineApi(),
      ndvi: async (id: string) => series({ fieldId: id, fieldName: `Tarla ${id}` }),
    };
    await loadNdvi(api, kv, 'a');
    await loadNdvi(api, kv, 'b');
    const off = await loadNdvi(offlineApi(), kv, 'a');
    expect(off?.data.kind === 'series' && off.data.fieldId).toBe('a');
    const remembered = await loadNdvi(offlineApi(), kv); // seçim: son seçilen (a)
    expect(remembered?.field.id).toBe('a');
  });

  it('sunucu "veri yok / sınır yok" derse bu da önbelleğe girer ve çevrimdışı aynen gösterilir', async () => {
    const kv = new MemoryKV();
    const none: NdviDto = { kind: 'none', reason: 'sinir-yok', fieldId: 'a' };
    await loadNdvi({ ...onlineApi(), ndvi: async () => none }, kv);
    expect((await loadNdvi(offlineApi(), kv))?.data).toEqual(none);
  });
});

describe('çevrimdışı sıra: tarla düzeltmesi', () => {
  const patch = { cropId: 'zeytin' };
  const item = (id: string) =>
    ({ id, kind: 'field-update', fieldId: 'a', patch, queuedAt: '2026-10-20T09:00:00Z' }) as const;

  it('çevrimdışıyken sırada kalır, bağlantı gelince sırayla gider, çift eklenmez', async () => {
    const kv = new MemoryKV();
    const sent: string[] = [];
    let online = false;
    const api = {
      createField: async () => {
        throw new Error('kullanılmaz');
      },
      nearbyClaim: async () => {
        throw new Error('kullanılmaz');
      },
      updateField: async (id: string, p: { cropId?: string }) => {
        if (!online) throw new NetworkError();
        sent.push(`${id}:${p.cropId}`);
        return field(id);
      },
    };
    const q = new OfflineQueue(kv, api);
    await q.enqueue(item('u1'));
    await q.enqueue(item('u1')); // çift dokunma
    await q.enqueue(item('u2'));
    expect(await q.pending()).toHaveLength(2);

    expect((await q.flush()).map((o) => o.result)).toEqual(['offline']); // ilk hatada durur
    expect(await q.pending()).toHaveLength(2);
    expect(sent).toEqual([]);

    online = true;
    expect((await q.flush()).map((o) => o.result)).toEqual(['sent', 'sent']);
    expect(sent).toEqual(['a:zeytin', 'a:zeytin']);
    expect(await q.pending()).toEqual([]);
  });

  it('sunucu reddederse (403) sıradan çıkar, sonrakiler gönderilir', async () => {
    const kv = new MemoryKV();
    const calls: string[] = [];
    const api = {
      createField: async () => field('x'),
      nearbyClaim: async () => ({ proposalId: 'p' }),
      updateField: async (id: string) => {
        calls.push(id);
        if (calls.length === 1) throw new ApiError(403, 'Yetkin yok');
        return field(id);
      },
    };
    const q = new OfflineQueue(kv, api);
    await q.enqueue(item('u1'));
    await q.enqueue(item('u2'));
    const out = await q.flush();
    expect(out.map((o) => o.result)).toEqual(['rejected', 'sent']);
    expect(await q.pending()).toEqual([]);
  });
});
