import { describe, expect, it } from 'vitest';
import {
  assessNdviTrend,
  median,
  parseStatisticalResponse,
  reliablePoints,
  type NdviPoint,
} from './ndvi';

const row = (from: string, to: string, mean: unknown, sample = 1000, noData = 0) => ({
  interval: { from: `${from}T00:00:00Z`, to: `${to}T00:00:00Z` },
  outputs: {
    ndvi: {
      bands: {
        B0: {
          stats: {
            min: 0.1,
            max: 0.9,
            mean,
            stDev: 0.05,
            sampleCount: sample,
            noDataCount: noData,
          },
        },
      },
    },
  },
});

const pt = (from: string, mean: number, validFraction = 1): NdviPoint => ({
  from,
  to: from,
  mean,
  min: 0,
  max: 1,
  stDev: 0,
  validFraction,
});

describe('Statistical API ayrıştırma', () => {
  it('sıralar, geçerli piksel oranını hesaplar', () => {
    const p = parseStatisticalResponse({
      data: [row('2026-06-08', '2026-06-15', 0.6, 400, 100), row('2026-06-01', '2026-06-08', 0.5)],
    });
    expect(p.map((x) => x.from)).toEqual(['2026-06-01', '2026-06-08']);
    expect(p[1]!.validFraction).toBeCloseTo(0.75, 12);
  });
  it('tamamı veri-yok, NaN/null ortalama, aralık dışı ve bozuk satırı atar', () => {
    const p = parseStatisticalResponse({
      data: [
        row('2026-06-01', '2026-06-08', 0.5, 100, 100),
        row('2026-06-08', '2026-06-15', 'NaN'),
        row('2026-06-15', '2026-06-22', null),
        row('2026-06-22', '2026-06-29', 1.4),
        { interval: {} },
        row('2026-06-29', '2026-07-06', 0.7),
      ],
    });
    expect(p).toHaveLength(1);
    expect(p[0]!.mean).toBe(0.7);
  });
  it('bozuk gövde boş döner', () => {
    expect(parseStatisticalResponse(null)).toEqual([]);
    expect(parseStatisticalResponse({ data: 3 })).toEqual([]);
    expect(parseStatisticalResponse({ error: 'x' })).toEqual([]);
  });
});

describe('güvenilirlik ve düşüş kuralı', () => {
  it('bulutlu aralık (geçerli oran < 0,5) elenir', () => {
    expect(reliablePoints([pt('a', 0.5, 0.49), pt('b', 0.5, 0.5)])).toHaveLength(1);
  });
  it('medyan', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it('0,70 civarı seriden 0,50ye düşüş = düşüş (0,20 >= 0,15)', () => {
    const t = assessNdviTrend([pt('1', 0.7), pt('2', 0.72), pt('3', 0.68), pt('4', 0.5)]);
    expect(t.kind).toBe('drop');
    if (t.kind === 'drop') {
      expect(t.baseline).toBeCloseTo(0.7, 12); // medyan(0,68; 0,7; 0,72)
      expect(t.drop).toBeCloseTo(0.2, 12);
    }
  });
  it('tam sınırda (0,15) düşüş sayılır, altında normal', () => {
    const base = [pt('1', 0.7), pt('2', 0.7), pt('3', 0.7)];
    expect(assessNdviTrend([...base, pt('4', 0.55)]).kind).toBe('drop');
    expect(assessNdviTrend([...base, pt('4', 0.56)]).kind).toBe('normal');
  });
  it('bulutlu son aralık hesaba girmez; son güvenilir değer kullanılır', () => {
    const t = assessNdviTrend([
      pt('1', 0.7),
      pt('2', 0.7),
      pt('3', 0.7),
      pt('4', 0.69),
      pt('5', 0.1, 0.1),
    ]);
    expect(t.kind).toBe('normal');
  });
  it('3 öncül değer yoksa karar yok', () => {
    expect(assessNdviTrend([pt('1', 0.7), pt('2', 0.7), pt('3', 0.2)])).toEqual({
      kind: 'unknown',
      reason: 'yetersiz-veri',
    });
    expect(assessNdviTrend([])).toEqual({ kind: 'unknown', reason: 'yetersiz-veri' });
  });
});
