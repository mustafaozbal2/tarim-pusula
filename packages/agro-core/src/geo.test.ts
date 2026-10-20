import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  isInTurkeyBox,
  isSelfIntersecting,
  pointInPolygon,
  polygonAreaDecare,
  polygonAreaSquareMeters,
  type LonLat,
} from './geo';

const sq = (lon: number, lat: number, dLon: number, dLat: number): LonLat[] => [
  { lon, lat },
  { lon: lon + dLon, lat },
  { lon: lon + dLon, lat: lat + dLat },
  { lon, lat: lat + dLat },
];

describe('alan hesabı (WGS84)', () => {
  it('ekvatorda 1°×1° kare ≈ 12.308,8 km² (elipsoid, GeographicLib değeri)', () => {
    const a = polygonAreaSquareMeters(sq(0, 0, 1, 1));
    expect(Math.abs(a / 12_308_778_361 - 1)).toBeLessThan(2e-4);
  });

  it('37°K 1°×1° kare: alan eşdeğeri küre analitik değerine %0,5 içinde', () => {
    const R = 6371007.2;
    const rad = Math.PI / 180;
    const exact = R * R * rad * (Math.sin(38 * rad) - Math.sin(37 * rad));
    const a = polygonAreaSquareMeters(sq(37, 37, 1, 1));
    expect(Math.abs(a / exact - 1)).toBeLessThan(5e-3);
  });

  it('100 m × 100 m tarla (Gaziantep enleminde) = 10 dekar', () => {
    const lat = 37.06;
    const r = Math.PI / 180;
    const mPerDegLat =
      111_132.954 - 559.822 * Math.cos(2 * lat * r) + 1.175 * Math.cos(4 * lat * r);
    const mPerDegLon = 111_412.84 * Math.cos(lat * r) - 93.5 * Math.cos(3 * lat * r);
    const ring = sq(37.38, lat, 100 / mPerDegLon, 100 / mPerDegLat);
    expect(polygonAreaDecare(ring)).toBeCloseTo(10, 1);
  });

  it('dik üçgen: karenin yarısı', () => {
    const full = polygonAreaSquareMeters(sq(37, 37, 0.001, 0.001));
    const tri = polygonAreaSquareMeters([
      { lon: 37, lat: 37 },
      { lon: 37.001, lat: 37 },
      { lon: 37, lat: 37.001 },
    ]);
    expect(tri / full).toBeCloseTo(0.5, 4);
  });

  it('köşe sırası ve kapalı halka sonucu değiştirmez', () => {
    const ring = sq(37, 37, 0.002, 0.001);
    const a = polygonAreaSquareMeters(ring);
    expect(polygonAreaSquareMeters([...ring, ring[0]!])).toBeCloseTo(a, 6);
    expect(polygonAreaSquareMeters([...ring].reverse())).toBeCloseTo(a, 6);
  });

  it('L biçimli (içbükey) çokgen: 3 birim kare', () => {
    const d = 0.001;
    const L: LonLat[] = [
      { lon: 37, lat: 37 },
      { lon: 37 + 2 * d, lat: 37 },
      { lon: 37 + 2 * d, lat: 37 + d },
      { lon: 37 + d, lat: 37 + d },
      { lon: 37 + d, lat: 37 + 2 * d },
      { lon: 37, lat: 37 + 2 * d },
    ];
    const unit = polygonAreaSquareMeters(sq(37, 37, d, d));
    expect(polygonAreaSquareMeters(L) / unit).toBeCloseTo(3, 3);
  });

  it('kendini kesen (kelebek) çokgeni reddeder', () => {
    const bow: LonLat[] = [
      { lon: 37, lat: 37 },
      { lon: 37.001, lat: 37.001 },
      { lon: 37.001, lat: 37 },
      { lon: 37, lat: 37.001 },
    ];
    expect(isSelfIntersecting(bow)).toBe(true);
    expect(() => polygonAreaDecare(bow)).toThrow(/kesiyor/);
    expect(isSelfIntersecting(sq(37, 37, 0.001, 0.001))).toBe(false);
  });

  it('geçersiz girdiyi reddeder', () => {
    expect(() =>
      polygonAreaDecare([
        { lon: 1, lat: 1 },
        { lon: 2, lat: 2 },
      ]),
    ).toThrow(/en az 3/);
    expect(() => polygonAreaDecare(sq(37, 95, 1, 1))).toThrow(/Geçersiz/);
    expect(() => polygonAreaDecare(sq(NaN, 37, 1, 1))).toThrow(/Geçersiz/);
  });
});

describe('nokta ve mesafe', () => {
  it('pointInPolygon', () => {
    const ring = sq(37, 37, 0.01, 0.01);
    expect(pointInPolygon({ lon: 37.005, lat: 37.005 }, ring)).toBe(true);
    expect(pointInPolygon({ lon: 37.02, lat: 37.005 }, ring)).toBe(false);
  });
  it('1° enlem ≈ 111,2 km', () => {
    expect(distanceMeters({ lon: 37, lat: 37 }, { lon: 37, lat: 38 })).toBeCloseTo(111_195, -2);
  });
  it('Türkiye kutusu', () => {
    expect(isInTurkeyBox({ lon: 37.38, lat: 37.06 })).toBe(true);
    expect(isInTurkeyBox({ lon: 2.35, lat: 48.85 })).toBe(false);
  });
});
