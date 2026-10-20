import { describe, expect, it } from 'vitest';
import {
  assessSuitability,
  classify,
  economicRange,
  matchSupports,
  rankCrops,
  trapezoid,
  weightedGeometricMean,
  type SuitabilityFactor,
  type SuitabilityResult,
  type SupportRecord,
} from './index';

describe('trapezoid', () => {
  it('köşeler ve kenarlar elle hesaplanmış değerlerle', () => {
    // a=4 b=6 c=8 d=10
    expect(trapezoid(3, 4, 6, 8, 10)).toBe(0);
    expect(trapezoid(4, 4, 6, 8, 10)).toBe(0);
    expect(trapezoid(5, 4, 6, 8, 10)).toBeCloseTo(0.5, 12);
    expect(trapezoid(6, 4, 6, 8, 10)).toBe(1);
    expect(trapezoid(7, 4, 6, 8, 10)).toBe(1);
    expect(trapezoid(8, 4, 6, 8, 10)).toBe(1);
    expect(trapezoid(9, 4, 6, 8, 10)).toBeCloseTo(0.5, 12);
    expect(trapezoid(9.5, 4, 6, 8, 10)).toBeCloseTo(0.25, 12);
    expect(trapezoid(10, 4, 6, 8, 10)).toBe(0);
    expect(trapezoid(11, 4, 6, 8, 10)).toBe(0);
  });
  it('dik kenar (a==b, c==d) sıfıra bölmez', () => {
    expect(trapezoid(4, 4, 4, 8, 10)).toBe(1);
    expect(trapezoid(3.99, 4, 4, 8, 10)).toBe(0);
    expect(trapezoid(10, 4, 6, 10, 10)).toBe(1);
    expect(trapezoid(10.01, 4, 6, 10, 10)).toBe(0);
  });
  it('simetri ve tekdüzelik', () => {
    for (const dx of [0.1, 0.7, 1.5, 1.9]) {
      expect(trapezoid(6 - dx, 4, 6, 8, 10)).toBeCloseTo(trapezoid(8 + dx, 4, 6, 8, 10), 12);
    }
    let prev = -1;
    for (let x = 4; x <= 6; x += 0.25) {
      const m = trapezoid(x, 4, 6, 8, 10);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });
  it('geçersiz köşe sırası ve sayı olmayan girdi hata verir', () => {
    expect(() => trapezoid(5, 6, 4, 8, 10)).toThrow();
    expect(() => trapezoid(5, 4, 6, 5, 10)).toThrow();
    expect(() => trapezoid(NaN, 4, 6, 8, 10)).toThrow();
  });
});

describe('weightedGeometricMean', () => {
  it('eşit ağırlık: karekök', () => {
    expect(
      weightedGeometricMean([
        { value: 0.5, weight: 1 },
        { value: 1, weight: 1 },
      ]),
    ).toBeCloseTo(Math.SQRT1_2, 12);
  });
  it('ağırlıklı: (0,5³·0,8)^(1/4) = 0,1^(1/4)', () => {
    expect(
      weightedGeometricMean([
        { value: 0.5, weight: 3 },
        { value: 0.8, weight: 1 },
      ]),
    ).toBeCloseTo(Math.pow(0.1, 0.25), 12);
  });
  it('ağırlık ölçeği sonucu değiştirmez', () => {
    const a = weightedGeometricMean([
      { value: 0.4, weight: 1 },
      { value: 0.9, weight: 2 },
    ]);
    const b = weightedGeometricMean([
      { value: 0.4, weight: 10 },
      { value: 0.9, weight: 20 },
    ]);
    expect(a).toBeCloseTo(b, 12);
  });
  it('Liebig: bir faktör 0 ise sonuç 0; hepsi 1 ise 1; aritmetik ortalamadan büyük olamaz', () => {
    expect(
      weightedGeometricMean([
        { value: 0, weight: 1 },
        { value: 1, weight: 5 },
      ]),
    ).toBe(0);
    expect(
      weightedGeometricMean([
        { value: 1, weight: 1 },
        { value: 1, weight: 2 },
      ]),
    ).toBeCloseTo(1, 12);
    const g = weightedGeometricMean([
      { value: 0.2, weight: 1 },
      { value: 0.9, weight: 1 },
    ]);
    expect(g).toBeLessThanOrEqual(0.55);
  });
  it('geçersiz girdi hata verir', () => {
    expect(() => weightedGeometricMean([])).toThrow();
    expect(() => weightedGeometricMean([{ value: 1.2, weight: 1 }])).toThrow();
    expect(() => weightedGeometricMean([{ value: 0.5, weight: 0 }])).toThrow();
  });
});

const factor = (
  key: string,
  trap: [number, number, number, number],
  over: Partial<SuitabilityFactor> = {},
): SuitabilityFactor => ({
  key,
  label: key,
  unit: '',
  trapezoid: trap,
  weight: 1,
  reviewStatus: 'uzman-onayli',
  source: 'test',
  sourceVersion: 'v1',
  sourceDate: '2026-10-01',
  ...over,
});

describe('assessSuitability', () => {
  const ph = factor('ph', [5.5, 6.5, 7.5, 8.5]);
  const yagis = factor('yagis', [300, 400, 600, 800]);
  it('elle hesap: ph 6 (0,5) ve yağış 700 (0,5) -> skor 0,5, uygun', () => {
    const r = assessSuitability([ph, yagis], { ph: 6, yagis: 700 });
    expect(r.kind).toBe('score');
    if (r.kind !== 'score') return;
    expect(r.score).toBeCloseTo(0.5, 12);
    expect(r.cls).toBe('uygun');
    expect(r.factors.map((f) => f.shareOfLoss)).toEqual([0.5, 0.5]);
  });
  it('sınırlayıcı faktör ve kayıp payları açıklanır', () => {
    // ph ideal (1), yağış 0,5 -> kayıp tamamen yağıştan
    const r = assessSuitability([ph, yagis], { ph: 7, yagis: 700 });
    if (r.kind !== 'score') throw new Error('skor bekleniyordu');
    expect(r.score).toBeCloseTo(Math.SQRT1_2, 12);
    expect(r.limiting.key).toBe('yagis');
    expect(r.factors.find((f) => f.key === 'ph')!.shareOfLoss).toBe(0);
    expect(r.factors.find((f) => f.key === 'yagis')!.shareOfLoss).toBeCloseTo(1, 12);
  });
  it('bir faktör 0 üyelikte ise skor 0 ve uygun değil; pay sıfır faktöre gider', () => {
    const r = assessSuitability([ph, yagis], { ph: 4, yagis: 500 });
    if (r.kind !== 'score') throw new Error('skor bekleniyordu');
    expect(r.score).toBe(0);
    expect(r.cls).toBe('uygun-degil');
    expect(r.limiting.key).toBe('ph');
    expect(r.factors.find((f) => f.key === 'ph')!.shareOfLoss).toBe(1);
  });
  it('değeri olmayan faktör atlanır ve eksik olarak bildirilir; uydurma değer yok', () => {
    const tuz = factor('tuz', [0, 0, 2, 4]);
    const r = assessSuitability([ph, yagis, tuz], { ph: 7, yagis: 500 });
    if (r.kind !== 'score') throw new Error('skor bekleniyordu');
    expect(r.missing).toEqual(['tuz']);
    expect(r.factors).toHaveLength(2);
  });
  it('tek faktörle skor verilmez', () => {
    const r = assessSuitability([ph, yagis], { ph: 7 });
    expect(r).toEqual({ kind: 'none', reason: 'yetersiz-veri', badge: false, keys: ['yagis'] });
  });
  it('KURAL 1: taslak faktör varsa skor yok, rozet var', () => {
    const taslak = factor('yagis', [300, 400, 600, 800], {
      reviewStatus: 'taslak-uzman-onayi-bekliyor',
    });
    const r = assessSuitability([ph, taslak], { ph: 7, yagis: 500 });
    expect(r).toEqual({ kind: 'none', reason: 'onaysiz-faktor', badge: true, keys: ['yagis'] });
  });
  it('taslak faktörün değeri yoksa o faktör zaten hesaba girmez', () => {
    const taslak = factor('tuz', [0, 0, 2, 4], { reviewStatus: 'taslak-uzman-onayi-bekliyor' });
    const r = assessSuitability([ph, yagis, taslak], { ph: 7, yagis: 500 });
    expect(r.kind).toBe('score');
  });
  it('ağırlık: ağır faktör skoru daha çok çeker', () => {
    const ph3 = factor('ph', [5.5, 6.5, 7.5, 8.5], { weight: 3 });
    const a = assessSuitability([ph3, yagis], { ph: 6, yagis: 500 });
    const b = assessSuitability([yagis, ph3], { ph: 6, yagis: 500 });
    if (a.kind !== 'score' || b.kind !== 'score') throw new Error('skor bekleniyordu');
    expect(a.score).toBeCloseTo(Math.pow(0.5, 0.75), 12); // (0,5³·1)^(1/4)
    expect(b.score).toBeCloseTo(a.score, 12); // sıra önemsiz
  });
  it('sınıf eşikleri', () => {
    expect(classify(0.75)).toBe('cok-uygun');
    expect(classify(0.7499)).toBe('uygun');
    expect(classify(0.5)).toBe('uygun');
    expect(classify(0.25)).toBe('sinirda');
    expect(classify(0.2499)).toBe('uygun-degil');
  });
});

describe('economicRange', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // P10=11, P90=19
  it('köşe birleşimi: P10·düşük verim − yüksek maliyet .. P90·yüksek verim − düşük maliyet', () => {
    const r = economicRange({
      prices,
      yieldKgPerDa: { low: 300, high: 500 },
      costTlPerDa: { low: 2000, high: 3000 },
    })!;
    expect(r.low).toBeCloseTo(11 * 300 - 3000, 9); // 300
    expect(r.high).toBeCloseTo(19 * 500 - 2000, 9); // 7500
    expect(r.isPredictionInterval).toBe(false);
    expect(r.basis).toContain('P10-P90');
  });
  it('aralık her zaman low <= high', () => {
    const r = economicRange({
      prices,
      yieldKgPerDa: { low: 100, high: 100 },
      costTlPerDa: { low: 500, high: 500 },
    })!;
    expect(r.low).toBeLessThanOrEqual(r.high);
  });
  it('yetersiz fiyat örneği ya da geçersiz girdi: aralık yok (uydurma yok)', () => {
    const ok = { yieldKgPerDa: { low: 300, high: 500 }, costTlPerDa: { low: 1, high: 2 } };
    expect(economicRange({ ...ok, prices: prices.slice(0, 7) })).toBeNull();
    expect(economicRange({ ...ok, prices: [] })).toBeNull();
    expect(economicRange({ ...ok, prices, yieldKgPerDa: { low: 500, high: 300 } })).toBeNull();
    expect(economicRange({ ...ok, prices, costTlPerDa: { low: 3, high: 2 } })).toBeNull();
  });
  it('geçersiz fiyatları (0, negatif, NaN) süzer', () => {
    const r = economicRange({
      prices: [...prices, 0, -5, NaN],
      yieldKgPerDa: { low: 300, high: 500 },
      costTlPerDa: { low: 2000, high: 3000 },
    });
    expect(r!.low).toBeCloseTo(300, 9);
  });
});

describe('rankCrops', () => {
  const score = (s: number) => {
    const f = factor('x', [0, 0, 1, 1]);
    const g = factor('y', [0, 0, 1, 1]);
    return assessSuitability([f, g], { x: s, y: s });
  };
  it('skorsuz ürün sıralamaya girmez; eşitlikte kimlik sırası', () => {
    const none: SuitabilityResult = {
      kind: 'none',
      reason: 'onaysiz-faktor',
      badge: true,
      keys: ['x'],
    };
    const r = rankCrops([
      { cropId: 'c', suitability: none, economic: null },
      { cropId: 'b', suitability: score(1), economic: null },
      { cropId: 'a', suitability: score(1), economic: null },
    ]);
    expect(r.map((x) => x.cropId)).toEqual(['a', 'b']);
  });
});

describe('matchSupports', () => {
  const base: SupportRecord = {
    id: 'a',
    title: 'Destek A',
    summary: 'özet',
    cropIds: [],
    provinces: [],
    reviewStatus: 'uzman-onayli',
    source: 'Bakanlık',
    sourceDate: '2026-10-01',
    sourceVersion: 'v1',
    applyFrom: '2026-09-01',
    applyTo: '2026-11-30',
  };
  const q = { cropId: 'zeytin', province: 'Gaziantep', areaDecare: 50, today: '2026-10-20' };
  it('kaynaksız kayıt hiç dönmez', () => {
    expect(matchSupports([{ ...base, source: '' }], q)).toEqual([]);
    expect(matchSupports([{ ...base, sourceDate: 'dün' }], q)).toEqual([]);
    expect(matchSupports([{ ...base, sourceVersion: ' ' }], q)).toEqual([]);
  });
  it('onaylı ve dönemi açık: "acik"; dönem dışı: "kapali"; dönemsiz: "donem-bilinmiyor"', () => {
    expect(matchSupports([base], q)[0]!.status).toBe('acik');
    expect(matchSupports([{ ...base, applyTo: '2026-10-01' }], q)[0]!.status).toBe('kapali');
    expect(matchSupports([{ ...base, applyFrom: null, applyTo: null }], q)[0]!.status).toBe(
      'donem-bilinmiyor',
    );
  });
  it('KURAL 1: taslak kayıt rozetli ve "onay-bekliyor"; dönem açık olsa bile açık denmez', () => {
    const [m] = matchSupports([{ ...base, reviewStatus: 'taslak-uzman-onayi-bekliyor' }], q);
    expect(m!.badge).toBe(true);
    expect(m!.status).toBe('onay-bekliyor');
    expect(m!.why).not.toContain('başvuru dönemi açık');
  });
  it('ürün, il (Türkçe büyük/küçük harf) ve alan kısıtları; bilinmeyen girdide kısıtlı kayıt elenir', () => {
    const r = { ...base, cropIds: ['zeytin'], provinces: ['GAZİANTEP'], minAreaDecare: 10 };
    expect(matchSupports([r], q)).toHaveLength(1);
    expect(matchSupports([r], { ...q, cropId: 'pamuk' })).toEqual([]);
    expect(matchSupports([r], { ...q, province: 'Mardin' })).toEqual([]);
    expect(matchSupports([r], { ...q, areaDecare: 5 })).toEqual([]);
    expect(matchSupports([r], { ...q, areaDecare: null })).toEqual([]);
    expect(matchSupports([{ ...base, maxAreaDecare: 40 }], q)).toEqual([]);
    expect(matchSupports([base], { today: q.today })).toHaveLength(1); // kısıtsız kayıt kalır
  });
  it('sıra: açık, dönem bilinmeyen, kapalı, taslak', () => {
    const ms = matchSupports(
      [
        { ...base, id: 'd', reviewStatus: 'taslak-uzman-onayi-bekliyor' },
        { ...base, id: 'k', applyTo: '2026-10-01' },
        { ...base, id: 'b', applyFrom: null, applyTo: null },
        { ...base, id: 'a' },
      ],
      q,
    );
    expect(ms.map((m) => m.support.id)).toEqual(['a', 'b', 'k', 'd']);
  });
});
