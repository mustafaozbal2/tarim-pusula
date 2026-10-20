import { describe, expect, it } from 'vitest';
import {
  adjustDepletionFraction,
  dailyBalance,
  decideIrrigation,
  readilyAvailableWater,
  SOIL_SEED,
  totalAvailableWater,
  waterStressCoefficient,
  type IrrigationInput,
} from './waterBalance';

describe('TAW / RAW (FAO-56 Denk. 82-83)', () => {
  it('θFC 0,23, θWP 0,10, Zr 0,5 m → TAW 65 mm', () => {
    expect(totalAvailableWater(0.23, 0.1, 0.5)).toBeCloseTo(65, 10);
  });
  it('p = 0,5 → RAW 32,5 mm', () => {
    expect(readilyAvailableWater(65, 0.5)).toBeCloseTo(32.5, 10);
  });
  it('geçersiz girdide hata verir', () => {
    expect(() => totalAvailableWater(0.1, 0.2, 1)).toThrow(RangeError);
    expect(() => totalAvailableWater(0.3, 0.1, 0)).toThrow(RangeError);
    expect(() => readilyAvailableWater(65, 1)).toThrow(RangeError);
  });
  it('p düzeltmesi: ETc 5 mm/gün → değişmez; sınırlar 0,1..0,8', () => {
    expect(adjustDepletionFraction(0.5, 5)).toBeCloseTo(0.5, 10);
    expect(adjustDepletionFraction(0.5, 3)).toBeCloseTo(0.58, 10);
    expect(adjustDepletionFraction(0.5, 10)).toBeCloseTo(0.3, 10);
    expect(adjustDepletionFraction(0.7, 0)).toBe(0.8);
    expect(adjustDepletionFraction(0.2, 12)).toBe(0.1);
  });
});

describe('Ks (Denk. 84)', () => {
  it('RAW altında ve sınırında 1', () => {
    expect(waterStressCoefficient(0, 100, 0.5)).toBe(1);
    expect(waterStressCoefficient(50, 100, 0.5)).toBe(1);
  });
  it('RAW ile TAW arasında doğrusal azalır', () => {
    expect(waterStressCoefficient(75, 100, 0.5)).toBeCloseTo(0.5, 10);
  });
  it('TAW noktasında 0', () => {
    expect(waterStressCoefficient(100, 100, 0.5)).toBe(0);
  });
});

describe('günlük denge (Denk. 85/88)', () => {
  const taw = 100;
  const p = 0.5;
  it('stressiz gün: Dr ETc kadar artar', () => {
    const r = dailyBalance(10, taw, p, { et0: 5, kc: 1 });
    expect(r.ks).toBe(1);
    expect(r.drEnd).toBeCloseTo(15, 10);
    expect(r.deepPercolation).toBe(0);
  });
  it('stresli gün: kullanım Ks ile azalır', () => {
    const r = dailyBalance(75, taw, p, { et0: 5, kc: 1 });
    expect(r.ks).toBeCloseTo(0.5, 10);
    expect(r.etcAdj).toBeCloseTo(2.5, 10);
    expect(r.drEnd).toBeCloseTo(77.5, 10);
  });
  it('fazla yağış: Dr 0 olur, fazlası derine sızar', () => {
    const r = dailyBalance(10, taw, p, { et0: 4, kc: 1, effectiveRainMm: 30 });
    expect(r.drEnd).toBe(0);
    expect(r.deepPercolation).toBeCloseTo(16, 10);
  });
  it('Dr, TAW üstüne çıkmaz', () => {
    expect(dailyBalance(100, taw, p, { et0: 8, kc: 1.2 }).drEnd).toBe(100);
  });
  it('su korunur: kuru dizide Dr toplamı ETc,adj toplamına eşit', () => {
    let dr = 0;
    let used = 0;
    for (let d = 0; d < 10; d++) {
      const r = dailyBalance(dr, taw, p, { et0: 6, kc: 1.1 });
      used += r.etcAdj;
      dr = r.drEnd;
    }
    expect(dr).toBeCloseTo(used, 8);
  });
  it('sulama eksiği geri doldurur', () => {
    const r = dailyBalance(40, taw, p, { et0: 5, kc: 1, irrigationMm: 40 });
    expect(r.drEnd).toBeCloseTo(5, 10);
  });
  it('sınır dışı girdide hata', () => {
    expect(() => dailyBalance(120, taw, p, { et0: 5, kc: 1 })).toThrow(RangeError);
    expect(() => dailyBalance(10, taw, p, { et0: 5, kc: 1, irrigationMm: -1 })).toThrow(RangeError);
  });
});

const ok = 'uzman-onayli' as const;
const draft = 'taslak-uzman-onayi-bekliyor' as const;
function base(over: Partial<IrrigationInput> = {}): IrrigationInput {
  return {
    kc: { value: 1, reviewStatus: ok },
    soil: { thetaFc: 0.23, thetaWp: 0.1, reviewStatus: ok },
    rootDepth: { valueM: 0.5, reviewStatus: ok },
    p: { value: 0.5, reviewStatus: ok },
    drYesterday: 10,
    et0: 5,
    forecastRainMm: 0,
    ...over,
  };
}

describe('kural motoru', () => {
  it('az eksik su → sulama gerekmiyor, adımlar gösterilir', () => {
    const d = decideIrrigation(base());
    expect(d.kind).toBe('skip');
    if (d.kind === 'skip') {
      expect(d.netDepthMm).toBe(0);
      expect(d.steps.map((s) => s.formula)).toContain('RAW = p × TAW');
      expect(d.steps.find((s) => s.formula.startsWith('TAW'))!.value).toBeCloseTo(65, 10);
    }
  });
  it('Dr RAW üstünde → sulama gerekir, miktar Dr kadar', () => {
    const d = decideIrrigation(base({ drYesterday: 40 }));
    expect(d.kind).toBe('irrigate');
    if (d.kind === 'irrigate') {
      expect(d.netDepthMm).toBeCloseTo(40, 10);
      expect(d.stressToday).toBe(true);
    }
  });
  it('bugünkü kayıp sınırı aşacaksa sulama gerekir, stres henüz yok', () => {
    const d = decideIrrigation(base({ drYesterday: 30 }));
    expect(d.kind).toBe('irrigate');
    if (d.kind === 'irrigate') expect(d.stressToday).toBe(false);
  });
  it('yağış beklentisi sulamayı gereksiz kılar', () => {
    expect(decideIrrigation(base({ drYesterday: 30, forecastRainMm: 15 })).kind).toBe('skip');
  });
  it.each([
    ['Kc', { kc: { value: 1, reviewStatus: draft } }],
    ['toprak', { soil: { thetaFc: 0.23, thetaWp: 0.1, reviewStatus: draft } }],
    ['kök derinliği', { rootDepth: { valueM: 0.5, reviewStatus: draft } }],
    ['tükenme oranı', { p: { value: 0.5, reviewStatus: draft } }],
  ] as const)('onaysız %s ile öneri üretilmez', (name, over) => {
    const d = decideIrrigation(base({ ...over, drYesterday: 60 }));
    expect(d.kind).toBe('none');
    if (d.kind === 'none') {
      expect(d.reason).toBe('uzman-onayi-bekliyor');
      expect(d.badge).toBe(true);
      expect(d.missing).toEqual([name]);
    }
  });
  it('toprak su durumu bilinmiyorsa öneri yok', () => {
    expect(decideIrrigation(base({ drYesterday: null }))).toMatchObject({
      kind: 'none',
      reason: 'deger-yok',
    });
  });
  it('tohum toprak parametreleri taslaktır ve öneri üretmez', () => {
    for (const s of SOIL_SEED) {
      expect(s.reviewStatus).toBe(draft);
      expect(totalAvailableWater(s.thetaFc, s.thetaWp, 1)).toBeGreaterThan(0);
    }
    expect(decideIrrigation(base({ soil: SOIL_SEED[1]!, drYesterday: 60 })).kind).toBe('none');
  });
});
