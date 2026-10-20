import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError, type FieldDto, type TodayDto } from './api/client';
import { MemoryKV } from './offline/kv';
import { loadToday, nextFieldId } from './today/load';
import { frostCardModel, frostWhen, waterNeedText, weatherText } from './today/model';
import { tr } from './i18n/tr';

const frostDto = (over: Partial<TodayDto['frost']> = {}): TodayDto['frost'] => ({
  assessment: {
    kind: 'frost',
    probability: 0.6,
    members: 40,
    level: 'warning',
    thresholdC: -2,
    medianMinC: -3.5,
    minMemberC: -6,
  },
  date: '2026-10-23', // Cuma sabahı
  dayOffset: 2,
  stageName: 'Çiçeklenme',
  unavailable: false,
  source: 'Open-Meteo',
  fetchedAt: '2026-10-21T10:00:00Z',
  ...over,
});

const field = (id: string, lat: number | null = 37): FieldDto => ({
  id,
  name: `Tarla ${id}`,
  province: null,
  district: null,
  village: null,
  lat,
  lon: lat === null ? null : 37,
  areaDecare: null,
  cropId: 'antep-fistigi',
  locationSource: 'gps',
  clientId: null,
});

const today = (id: string): TodayDto => ({
  fieldId: id,
  fieldName: `Tarla ${id}`,
  generatedAt: '2026-10-21T10:00:00Z',
  weather: {
    source: 'Open-Meteo',
    fetchedAt: '2026-10-21T10:00:00Z',
    stale: false,
    elevationM: 800,
    current: { tempC: 12.4, weatherCode: 2 },
    today: { date: '2026-10-21', tMinC: 8, tMaxC: 22, precipMm: 0 },
  },
  et0: { mmPerDay: 2.5, method: 'FAO-56 Penman-Monteith' },
  waterNeed: { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true },
  frost: frostDto(),
});

describe('don kartı metni', () => {
  it('uyarı: Cuma sabahı don için "Perşembe gecesi" yazılır', () => {
    const m = frostCardModel(frostDto());
    expect(m.kind).toBe('warning');
    expect(m.title).toBe('Perşembe gecesi don bekleniyor');
    expect(m.body).toContain('%60');
    expect('why' in m && m.why).toContain('40 denemesinden 24');
  });
  it('bu gece / bu sabah', () => {
    expect(frostWhen(1, '2026-10-22')).toBe('Bu gece');
    expect(frostWhen(0, '2026-10-21')).toBe('Bu sabah');
    expect(frostWhen(2, '2026-10-24')).toBe('Cuma gecesi');
  });
  it('onaysız eşik: uyarı yok, rozetli sakin kart (kural 1)', () => {
    const m = frostCardModel(
      frostDto({ assessment: { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true } }),
    );
    expect(m.kind).toBe('pending');
    expect(m.title).toContain('uzman onayı bekliyor');
  });
  it('düşük olasılık sakin; veri yoksa "alınamadı"', () => {
    const calm = frostCardModel(
      frostDto({
        assessment: {
          kind: 'frost',
          probability: 0.05,
          members: 40,
          level: 'none',
          thresholdC: -2,
          medianMinC: 4,
          minMemberC: -1,
        },
      }),
    );
    expect(calm.kind).toBe('quiet');
    expect(frostCardModel(frostDto({ unavailable: true })).kind).toBe('unavailable');
  });
  it('hava kodu ve su ihtiyacı metni', () => {
    expect(weatherText(2)).toBe('Bugün hava parçalı bulutlu');
    expect(weatherText(63)).toBe('Bugün yağmur var');
    expect(waterNeedText({ kind: 'water-need', etcMmPerDay: 3.456, kc: 1 })).toBe('3,5 mm');
    expect(waterNeedText({ kind: 'none', reason: 'deger-yok', badge: false })).toBeNull();
  });
  it('metinlerde emoji ve jargon yok', () => {
    const all = JSON.stringify(tr.today);
    expect(all).not.toMatch(/evapotranspirasyon|ensemble|ET0/i);
  });
});

describe('Bugün verisi yükleme', () => {
  it('sunucudan alır, önbelleğe yazar; ağ kesilince son bilgiyi "çevrimdışı" gösterir', async () => {
    const kv = new MemoryKV();
    let down = false;
    const api = {
      fields: async () => {
        if (down) throw new NetworkError();
        return [field('a'), field('b')];
      },
      today: async (id: string) => {
        if (down) throw new NetworkError();
        return today(id);
      },
    };
    const first = await loadToday(api, kv);
    expect(first).toMatchObject({ offline: false, field: { id: 'a' } });
    expect(first!.today.fieldName).toBe('Tarla a');

    down = true;
    const second = await loadToday(api, kv);
    expect(second).toMatchObject({ offline: true, field: { id: 'a' } });
    expect(second!.at).toBe(first!.at);
  });

  it('tarla seçimi hatırlanır; konumsuz tarlalar atlanır; tarla yoksa null', async () => {
    const kv = new MemoryKV();
    const api = {
      fields: async () => [field('x', null), field('a'), field('b')],
      today: async (id: string) => today(id),
    };
    expect((await loadToday(api, kv))!.field.id).toBe('a');
    expect((await loadToday(api, kv, 'b'))!.field.id).toBe('b');
    expect((await loadToday(api, kv))!.field.id).toBe('b'); // hatırlandı
    expect(nextFieldId([field('a'), field('b')], 'b')).toBe('a');
    expect(
      await loadToday({ fields: async () => [], today: api.today }, new MemoryKV()),
    ).toBeNull();
  });

  it('hiç önbellek yokken ve sunucu hata verirken hata fırlatır', async () => {
    const api = {
      fields: async () => [field('a')],
      today: async () => {
        throw new ApiError(503, 'Hava verisi alınamadı');
      },
    };
    await expect(loadToday(api, new MemoryKV())).rejects.toThrow();
  });
});
