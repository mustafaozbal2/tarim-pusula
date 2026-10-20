import { describe, expect, it } from 'vitest';
import {
  accumulatedGdd,
  adjustTempForElevation,
  assessFrost,
  atmosphericPressure,
  dailyGdd,
  dayOfYear,
  et0PenmanMonteith,
  extraterrestrialRadiation,
  frostLevel,
  frostProbability,
  psychrometricConstant,
  saturationVaporPressure,
  vaporPressureSlope,
  windAt2m,
} from './index';

describe('FAO-56 ara denklemler', () => {
  it('Örnek 2-3: e°(24,5)=3,075; Δ(16,9)=0,122; basınç 100 m = 100,1', () => {
    expect(saturationVaporPressure(24.5)).toBeCloseTo(3.075, 2);
    expect(vaporPressureSlope(16.9)).toBeCloseTo(0.122, 3);
    expect(atmosphericPressure(100)).toBeCloseTo(100.1, 1);
    expect(psychrometricConstant(81.8)).toBeCloseTo(0.0544, 4);
  });
  it('rüzgâr 10 m → 2 m: 2,78 m/s → 2,08', () => {
    expect(windAt2m(2.78, 10)).toBeCloseTo(2.078, 2);
  });
  it('yılın günü: 6 Temmuz = 187', () => {
    expect(dayOfYear(new Date('2026-07-06T00:00:00Z'))).toBe(187);
  });
  it('Ra: Örnek 8 (3 Eylül, 20°S) ≈ 32,2', () => {
    expect(extraterrestrialRadiation(-20, 246).ra).toBeCloseTo(32.2, 0);
  });
});

describe('ET0 — FAO-56 Örnek 18 (Uccle/Brüksel, 6 Temmuz)', () => {
  const r = et0PenmanMonteith({
    tMinC: 12.3,
    tMaxC: 21.5,
    rhMaxPct: 84,
    rhMinPct: 63,
    windSpeed: 10 / 3.6,
    windHeightM: 10,
    sunshineHours: 9.25,
    elevationM: 100,
    latitudeDeg: 50.8,
    dayOfYear: 187,
  });
  it('ET0 = 3,9 mm/gün ±0,05', () => {
    expect(Math.abs(r.et0 - 3.9)).toBeLessThanOrEqual(0.05);
  });
  it('ara değerler: es 1,997, ea 1,409, Rs ≈ 22,07, Rn ≈ 13,28', () => {
    expect(r.es).toBeCloseTo(1.997, 2);
    expect(r.ea).toBeCloseTo(1.409, 2);
    expect(r.rs).toBeCloseTo(22.07, 0);
    expect(r.rn).toBeCloseTo(13.28, 0);
  });
});

describe('ET0 — diğer yollar', () => {
  const base = {
    tMinC: 12,
    tMaxC: 28,
    windSpeed: 2,
    elevationM: 800,
    latitudeDeg: 37,
    dayOfYear: 200,
  };
  it('Rs ve nem yokken (Hargreaves + Tmin) makul aralıkta', () => {
    const e = et0PenmanMonteith(base).et0;
    expect(e).toBeGreaterThan(3);
    expect(e).toBeLessThan(9);
  });
  it('sıcak/kuru gün daha çok su ister; negatif olmaz', () => {
    const hot = et0PenmanMonteith({ ...base, tMaxC: 38, rhMeanPct: 25 }).et0;
    const cool = et0PenmanMonteith({ ...base, tMaxC: 20, rhMeanPct: 90 }).et0;
    expect(hot).toBeGreaterThan(cool);
    const cold = et0PenmanMonteith({ ...base, tMinC: -5, tMaxC: -2, dayOfYear: 1 }).et0;
    expect(cold).toBeGreaterThanOrEqual(0);
  });
  it('Tmax < Tmin hata verir', () => {
    expect(() => et0PenmanMonteith({ ...base, tMaxC: 5 })).toThrow(RangeError);
  });
});

describe('yükselti ve GDD', () => {
  it('6,5 °C/km: +500 m → −3,25 °C; aşağı inince ısınır', () => {
    expect(adjustTempForElevation(10, 500, 1000)).toBeCloseTo(6.75, 6);
    expect(adjustTempForElevation(10, 800, 300)).toBeCloseTo(13.25, 6);
    expect(adjustTempForElevation(10, 500, 500)).toBe(10);
  });
  it('GDD: kırpma (taban 10, üst 30)', () => {
    expect(dailyGdd(15, 25, 10, 30)).toBe(10);
    expect(dailyGdd(5, 35, 10, 30)).toBe(10); // (30+10)/2 − 10
    expect(dailyGdd(0, 8, 10)).toBe(0);
    const days = [
      { tMinC: 15, tMaxC: 25 },
      { tMinC: 12, tMaxC: 22 },
    ];
    expect(accumulatedGdd(days, 10)).toBe(17);
  });
});

describe('don olasılığı (sentetik ensemble)', () => {
  const members = Array.from({ length: 40 }, (_, i) => -4 + i * 0.25); // −4 … +5,75
  it('oran = Tmin ≤ Tkritik üyeler / tüm üyeler', () => {
    const p = frostProbability(members, -3); // −4, −3,75, −3,5, −3,25, −3 → 5 üye
    expect(p.probability).toBeCloseTo(5 / 40, 10);
    expect(p.members).toBe(40);
    expect(p.minMemberC).toBe(-4);
  });
  it('uçlar: hepsi / hiçbiri; sınır dahil', () => {
    expect(frostProbability([-5, -6, -7], -3).probability).toBe(1);
    expect(frostProbability([1, 2, 3], -3).probability).toBe(0);
    expect(frostProbability([-3, 0], -3).probability).toBe(0.5);
  });
  it('NaN üyeler atılır; boş ensemble hata', () => {
    expect(frostProbability([NaN, -4, 2, 2], -3).probability).toBeCloseTo(1 / 3, 10);
    expect(() => frostProbability([NaN], -3)).toThrow(RangeError);
  });
  it('düzeyler', () => {
    expect(frostLevel(0.1)).toBe('none');
    expect(frostLevel(0.2)).toBe('watch');
    expect(frostLevel(0.5)).toBe('warning');
  });
  it('onaysız eşik uyarı üretmez (kural 1); onaylı üretir', () => {
    const draft = assessFrost(
      { frostCriticalC: -2, reviewStatus: 'taslak-uzman-onayi-bekliyor' },
      [-9, -9],
    );
    expect(draft).toMatchObject({ kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true });
    const ok = assessFrost({ frostCriticalC: -2, reviewStatus: 'uzman-onayli' }, [-9, -9, 3, 3]);
    expect(ok).toMatchObject({ kind: 'frost', probability: 0.5, level: 'warning', thresholdC: -2 });
    expect(assessFrost(undefined, [0])).toMatchObject({ kind: 'none', reason: 'deger-yok' });
    const noThr = assessFrost({ frostCriticalC: null, reviewStatus: 'uzman-onayli' }, [0]);
    expect(noThr).toMatchObject({ kind: 'none' });
  });
});
