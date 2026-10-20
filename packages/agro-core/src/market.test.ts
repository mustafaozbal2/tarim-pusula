import { describe, expect, it } from 'vitest';
import { netProfitRange, priceTrend, quantile, sourcedOnly, type PriceSource } from './market';

const src: PriceSource = { name: 'X', date: '2026-10-19', version: 'v1' };

describe('quantile', () => {
  it('PERCENTILE.INC ile aynı', () => {
    const v = [15, 20, 35, 40, 50];
    expect(quantile(v, 0)).toBe(15);
    expect(quantile(v, 0.5)).toBe(35);
    expect(quantile(v, 1)).toBe(50);
    expect(quantile(v, 0.4)).toBeCloseTo(29, 10); // h=1.6 -> 20 + 0.6*15
    expect(quantile([1, 2, 3, 4], 0.1)).toBeCloseTo(1.3, 10);
    expect(quantile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7, 10);
  });
  it('sıra bağımsız, boş küme hata', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(() => quantile([], 0.5)).toThrow();
  });
});

describe('sourcedOnly', () => {
  it('kaynaksız, tarihsiz, sürümsüz ve geçersiz fiyatı eler', () => {
    const pts = [
      { price: 10, source: src },
      { price: 11, source: null },
      { price: 12, source: undefined },
      { price: 13, source: { ...src, date: '19.10.2026' } },
      { price: 14, source: { ...src, version: ' ' } },
      { price: 15, source: { ...src, name: '' } },
      { price: -1, source: src },
      { price: Number.NaN, source: src },
      { price: 0, source: src },
    ];
    expect(sourcedOnly(pts).map((p) => p.price)).toEqual([10]);
  });
});

const series = (n: number, f: (i: number) => number, start = '2026-08-01') =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
    price: f(i),
  }));

describe('priceTrend', () => {
  it('doğrusal artış: eğim 1 TL/gün, ortalama 129,5', () => {
    const t = priceTrend(series(60, (i) => 100 + i));
    expect(t.direction).toBe('up');
    expect(t.changePct30d).toBeCloseTo((30 / 129.5) * 100, 8);
    expect(t.days).toBe(60);
  });
  it('düşüş ve yatay', () => {
    expect(priceTrend(series(30, (i) => 200 - i)).direction).toBe('down');
    expect(priceTrend(series(30, () => 50)).direction).toBe('flat');
    // %2 altı değişim yatay sayılır
    expect(priceTrend(series(30, (i) => 100 + 0.01 * i)).direction).toBe('flat');
  });
  it('az veri ya da kısa aralık: bilinmiyor (uydurma yok)', () => {
    expect(priceTrend(series(3, (i) => 10 + i)).direction).toBe('unknown');
    expect(priceTrend(series(10, (i) => 10 + i)).direction).toBe('unknown');
    expect(priceTrend([]).changePct30d).toBeNull();
  });
  it('aynı güne ait fiyatlar ortalanır, geçersizler atlanır', () => {
    const pts = [
      ...series(20, (i) => 100 + i),
      { date: '2026-08-01', price: 100 },
      { date: '2026-08-02', price: -5 },
    ];
    expect(priceTrend(pts).days).toBe(20);
  });
});

describe('netProfitRange', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // P10=11, P50=15, P90=19
  const none = { transportTlPerTonKm: null, distanceKm: null, commissionRate: null };
  it('kesintisiz: fiyat yüzdelikleri', () => {
    const r = netProfitRange({ prices, ...none });
    expect(r).toMatchObject({ kind: 'range', p10: 11, p50: 15, p90: 19, samples: 11 });
    expect(r.assumptions).toContain('Nakliye hesaba katılmadı');
    expect(r.assumptions).toContain('Komisyon hesaba katılmadı');
  });
  it('komisyon ve nakliye: net = p(1-c) - t*km/1000', () => {
    const r = netProfitRange({
      prices,
      transportTlPerTonKm: 5,
      distanceKm: 100,
      commissionRate: 0.1,
    });
    // nakliye = 0.5 TL/kg
    expect(r.p10).toBeCloseTo(11 * 0.9 - 0.5, 10);
    expect(r.p90).toBeCloseTo(19 * 0.9 - 0.5, 10);
    expect(r.p10!).toBeLessThan(r.p50!);
    expect(r.p50!).toBeLessThan(r.p90!);
  });
  it('az örnek: aralık yok', () => {
    const r = netProfitRange({ prices: [10, 11], ...none });
    expect(r).toMatchObject({ kind: 'insufficient', p10: null, p90: null });
  });
  it('geçersiz komisyon/negatif maliyet hata', () => {
    expect(() => netProfitRange({ prices, ...none, commissionRate: 1 })).toThrow();
    expect(() =>
      netProfitRange({ prices, ...none, transportTlPerTonKm: -1, distanceKm: 5 }),
    ).toThrow();
  });
});
