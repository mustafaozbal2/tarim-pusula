import { describe, expect, it } from 'vitest';
import type { MarketPlaceDto } from '../api/client';
import { changeArrow, directionsUrl, pickCurrent, productImageName } from './model';

const place = (over: Partial<MarketPlaceDto>): MarketPlaceDto => ({
  placeId: 'p1',
  name: 'Gaziantep Ticaret Borsası',
  province: 'Gaziantep',
  lat: 37.0662,
  lon: 37.3833,
  product: 'Antep fıstığı',
  price: 285,
  priceMin: 280,
  priceMax: 290,
  date: '2026-10-19',
  stale: false,
  distanceKm: 4,
  approxLocation: true,
  source: { name: 'Borsa bülteni', date: '2026-10-19', version: 'v1' },
  trend: { direction: 'up', changePct30d: 4.26, days: 30 },
  net: { kind: 'insufficient', p10: null, p50: null, p90: null, samples: 0, assumptions: [] },
  ...over,
});

describe('fiyat konumu: seçili arazinin ili, GPS değil', () => {
  const gaziantep = place({ placeId: 'gaz', province: 'Gaziantep', date: '2026-10-19' });
  const isparta = place({
    placeId: 'isp',
    name: 'Isparta Borsası',
    province: 'Isparta',
    date: '2026-10-22',
  });
  const national = place({
    placeId: 'tepge',
    province: null,
    lat: null,
    lon: null,
    date: '2026-10-23',
  });
  const data = { current: national, places: [gaziantep, isparta], national: [national] };

  it('arazinin ilindeki yer seçilir (en yeni kayıt başka ilde olsa bile)', () => {
    const r = pickCurrent(data, 'Isparta', null);
    expect(r).toMatchObject({ basis: 'arazi-ili' });
    expect(r.place?.placeId).toBe('isp');
  });
  it('il karşılaştırması Türkçe harf duyarlıdır (İzmir ≙ izmir)', () => {
    const izmir = place({ placeId: 'izm', province: 'İzmir' });
    expect(pickCurrent({ ...data, places: [izmir] }, 'izmir', null).place?.placeId).toBe('izm');
    expect(pickCurrent(data, 'ISPARTA', null).place?.placeId).toBe('isp');
  });
  it('çiftçinin seçtiği satış yeri her şeyden önce gelir', () => {
    const r = pickCurrent(data, 'Isparta', 'gaz');
    expect(r).toMatchObject({ basis: 'secilen-yer' });
    expect(r.place?.placeId).toBe('gaz');
  });
  it('ilde kayıt yoksa en yeni kayıt, açıkça "en-yeni-kayit" olarak işaretlenir', () => {
    const r = pickCurrent(data, 'Van', null);
    expect(r.basis).toBe('en-yeni-kayit');
    expect(r.place?.placeId).toBe('tepge');
  });
  it('künyesiz kayıt hiç seçilmez; hiç veri yoksa "yok"', () => {
    const noSource = place({ placeId: 'x', source: { name: '', date: '', version: '' } });
    expect(
      pickCurrent({ current: noSource, places: [noSource], national: [] }, 'Gaziantep', null),
    ).toEqual({ place: null, basis: 'yok' });
  });
});

describe('yol tarifi bağlantısı (hedef koordinat)', () => {
  it('Android geo: şeması, iOS Apple Haritalar, web Google Haritalar', () => {
    expect(directionsUrl('android', 37.0662, 37.3833, 'Gaziantep Borsası')).toBe(
      'geo:37.0662,37.3833?q=37.0662,37.3833(Gaziantep%20Borsas%C4%B1)',
    );
    expect(directionsUrl('ios', 37.0662, 37.3833, 'Borsa')).toBe(
      'http://maps.apple.com/?daddr=37.0662,37.3833&q=Borsa',
    );
    expect(directionsUrl('web', 37.0662, 37.3833, 'Borsa')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=37.0662,37.3833',
    );
  });
});

describe('fiyat değişim oku ve ürün görselleri', () => {
  it('yön ve yüzde yazısı; yatay ve bilinmeyen', () => {
    expect(changeArrow({ direction: 'up', changePct30d: 4.26, days: 30 })).toEqual({
      dir: 'up',
      text: 'Yükseldi %4,3',
    });
    expect(changeArrow({ direction: 'down', changePct30d: -12, days: 30 })).toEqual({
      dir: 'down',
      text: 'Düştü %12',
    });
    expect(changeArrow({ direction: 'flat', changePct30d: 0, days: 30 }).dir).toBe('flat');
    expect(changeArrow({ direction: 'unknown', changePct30d: null, days: 3 }).text).toBe(
      'Veri yok',
    );
  });
  it('ürün görseli 6 yuvada döner', () => {
    expect(productImageName(0)).toBe('urun_1.jpg');
    expect(productImageName(5)).toBe('urun_6.jpg');
    expect(productImageName(6)).toBe('urun_1.jpg');
  });
});
