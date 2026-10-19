import { describe, expect, it } from 'vitest';
import { cropEvapotranspiration, kcForDay, totalSeasonDays, type KcStages } from './kc';

// FAO-56 Tablo 11/12 değerleriyle sade bir örnek: kc_ini 0.3, kc_mid 1.15, kc_end 0.25.
const arpa: KcStages = {
  kcIni: 0.3,
  kcMid: 1.15,
  kcEnd: 0.25,
  lIni: 15,
  lDev: 25,
  lMid: 50,
  lLate: 30,
};

describe('kcForDay', () => {
  it('başlangıç evresinde sabittir', () => {
    expect(kcForDay(arpa, 0)).toBe(0.3);
    expect(kcForDay(arpa, 15)).toBe(0.3);
  });
  it('gelişme evresinde doğrusal artar (orta nokta)', () => {
    expect(kcForDay(arpa, 27.5)).toBeCloseTo((0.3 + 1.15) / 2, 10);
  });
  it('orta evrede kc_mid', () => {
    expect(kcForDay(arpa, 40)).toBe(1.15);
    expect(kcForDay(arpa, 90)).toBe(1.15);
  });
  it('son evrede kc_end değerine iner', () => {
    expect(kcForDay(arpa, 105)).toBeCloseTo((1.15 + 0.25) / 2, 10);
    expect(kcForDay(arpa, totalSeasonDays(arpa))).toBeCloseTo(0.25, 10);
  });
  it('sezon dışını reddeder', () => {
    expect(() => kcForDay(arpa, -1)).toThrow(RangeError);
    expect(() => kcForDay(arpa, 121)).toThrow(RangeError);
    expect(() => kcForDay(arpa, NaN)).toThrow(RangeError);
  });
});

describe('cropEvapotranspiration', () => {
  it('ETc = Kc × ET0', () => {
    expect(cropEvapotranspiration(1.15, 5)).toBeCloseTo(5.75, 10);
  });
  it('negatif girdiyi reddeder', () => {
    expect(() => cropEvapotranspiration(-1, 5)).toThrow(RangeError);
  });
});
