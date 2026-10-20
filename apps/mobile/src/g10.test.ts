import { describe, expect, it } from 'vitest';
import type { MarketDto, MarketPlaceDto } from './api/client';
import { loadMarket } from './market/load';
import {
  dayText,
  distanceText,
  hasSource,
  netText,
  sourceLine,
  tl,
  trendText,
} from './market/model';
import { MemoryKV } from './offline/kv';
import { FIELDS_CACHE, SELECTED } from './today/load';

const place = (over: Partial<MarketPlaceDto> = {}): MarketPlaceDto => ({
  placeId: 'borsa',
  name: 'Gaziantep Ticaret Borsası',
  product: 'Antep Fıstığı',
  price: 285,
  priceMin: 275,
  priceMax: 295.5,
  date: '2026-10-19',
  stale: false,
  distanceKm: 18.2,
  approxLocation: true,
  source: { name: 'Gaziantep Ticaret Borsası', date: '2026-10-19', version: 'borsa-v1@2026-10-19' },
  trend: { direction: 'up', changePct30d: 11, days: 40 },
  net: {
    kind: 'range',
    p10: 251.2,
    p50: 270,
    p90: 298.4,
    samples: 40,
    assumptions: ['Nakliye hesaba katılmadı'],
  },
  ...over,
});

describe('biçimleme', () => {
  it('TL: 100 ve üstü tam sayı, altı tek ondalık, virgüllü', () => {
    expect(tl(285)).toBe('285 ₺');
    expect(tl(284.6)).toBe('285 ₺');
    expect(tl(22.34)).toBe('22,3 ₺');
    expect(tl(18)).toBe('18 ₺');
  });
  it('tarih, mesafe, trend, net', () => {
    expect(dayText('2026-10-19')).toBe('19 Ekim 2026');
    expect(distanceText(place())).toBe('18 km uzakta (yaklaşık, kuş uçuşu)');
    expect(distanceText(place({ distanceKm: 4.26, approxLocation: false }))).toBe('4,3 km uzakta');
    expect(distanceText(place({ distanceKm: null }))).toBeNull();
    expect(trendText({ direction: 'down', changePct30d: -5, days: 9 })).toBe(
      'Son 30 günde düşüyor',
    );
    expect(trendText({ direction: 'unknown', changePct30d: null, days: 1 })).toBe(
      'Eğilim için yeterli veri yok',
    );
    expect(netText(place().net)).toBe('251 ₺ - 298 ₺');
    expect(
      netText({
        kind: 'insufficient',
        p10: null,
        p50: null,
        p90: null,
        samples: 2,
        assumptions: [],
      }),
    ).toBeNull();
  });
  it('kaynak satırı ad + tarih içerir; kaynaksız fiyat gösterilmez', () => {
    expect(sourceLine(place())).toBe('Kaynak: Gaziantep Ticaret Borsası · 19 Ekim 2026');
    expect(hasSource(place())).toBe(true);
    expect(hasSource(place({ source: { name: '', date: '2026-10-19', version: 'v' } }))).toBe(
      false,
    );
    expect(hasSource(place({ source: { name: 'X', date: 'dün', version: 'v' } }))).toBe(false);
    expect(hasSource(place({ source: { name: 'X', date: '2026-10-19', version: ' ' } }))).toBe(
      false,
    );
  });
});

const dto = (): MarketDto => ({
  cropId: 'zeytin',
  cropName: 'Zeytin',
  current: place(),
  places: [place()],
  national: [],
});

describe('loadMarket', () => {
  it('çevrimiçi: sunucu verisi, önbelleğe yazar; seçili tarla mesafe için gönderilir', async () => {
    const kv = new MemoryKV();
    await kv.set(
      FIELDS_CACHE,
      JSON.stringify({
        at: 'x',
        fields: [
          { id: 'f1', lat: 1, lon: 2 },
          { id: 'f2', lat: 3, lon: 4 },
        ],
      }),
    );
    await kv.set(SELECTED, 'f2');
    const asked: unknown[][] = [];
    const api = {
      marketCrops: async () => [
        { id: 'zeytin', name: 'Zeytin' },
        { id: 'bugday', name: 'Buğday' },
      ],
      marketPrices: async (...a: unknown[]) => (asked.push(a), dto()),
    };
    const r = await loadMarket(api, kv, 'bugday');
    expect(asked).toEqual([['bugday', 'f2']]);
    expect(r).toMatchObject({ cropId: 'bugday', offline: false });
    expect(r.data?.current?.price).toBe(285);
  });
  it('bilinmeyen ürün seçimi ilk ürüne düşer', async () => {
    const api = {
      marketCrops: async () => [{ id: 'zeytin', name: 'Zeytin' }],
      marketPrices: async () => dto(),
    };
    expect((await loadMarket(api, new MemoryKV(), 'yok')).cropId).toBe('zeytin');
  });
  it('internet yok: son önbellek ve çevrimdışı işareti', async () => {
    const kv = new MemoryKV();
    const ok = {
      marketCrops: async () => [{ id: 'zeytin', name: 'Zeytin' }],
      marketPrices: async () => dto(),
    };
    const first = await loadMarket(ok, kv);
    const down = {
      marketCrops: async () => {
        throw new Error('ağ');
      },
      marketPrices: async () => {
        throw new Error('ağ');
      },
    };
    const r = await loadMarket(down, kv);
    expect(r.offline).toBe(true);
    expect(r.data?.current?.price).toBe(285);
    expect(r.at).toBe(first.at);
  });
  it('internet yok ve önbellek yok: hata (uydurma fiyat yok)', async () => {
    const down = {
      marketCrops: async () => {
        throw new Error('ağ');
      },
      marketPrices: async () => {
        throw new Error('ağ');
      },
    };
    expect(await loadMarket(down, new MemoryKV())).toMatchObject({
      cropId: null,
      data: null,
      offline: true,
    });
  });
  it('ürün var ama fiyat sorgusu çöker ve önbellek yok: hata fırlatır', async () => {
    const api = {
      marketCrops: async () => [{ id: 'zeytin', name: 'Zeytin' }],
      marketPrices: async () => {
        throw new Error('ağ');
      },
    };
    await expect(loadMarket(api, new MemoryKV())).rejects.toThrow();
  });
});
