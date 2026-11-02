import { describe, expect, it } from 'vitest';
import { havaSahnesi, PARCACIK, tohum } from './havaSahne';

describe('hava efekti sahnesi (WMO kodu)', () => {
  it('açık hava gündüz güneş, gece yıldız', () => {
    expect(havaSahnesi(0, 12)).toBe('gunes');
    expect(havaSahnesi(1, 9)).toBe('gunes');
    expect(havaSahnesi(0, 22)).toBe('gece');
    expect(havaSahnesi(1, 5)).toBe('gece');
  });
  it('bulut, sis, yağmur, sağanak, kar, fırtına', () => {
    expect(havaSahnesi(3, 12)).toBe('bulut');
    expect(havaSahnesi(45, 12)).toBe('sis');
    expect(havaSahnesi(61, 12)).toBe('yagmur');
    expect(havaSahnesi(81, 12)).toBe('yagmur');
    expect(havaSahnesi(66, 12)).toBe('yagmur'); // donan yağmur
    expect(havaSahnesi(73, 12)).toBe('kar');
    expect(havaSahnesi(86, 12)).toBe('kar');
    expect(havaSahnesi(95, 12)).toBe('firtina');
  });
  it('bilinmeyen ya da eksik kodda efekt yok', () => {
    expect(havaSahnesi(null, 12)).toBe('yok');
    expect(havaSahnesi(undefined, 12)).toBe('yok');
    expect(havaSahnesi(Number.NaN, 12)).toBe('yok');
    expect(havaSahnesi(42, 12)).toBe('yok');
  });
  it('parçacık sayısı sınırlı (performans) ve dağılım kararlı', () => {
    expect(Math.max(...Object.values(PARCACIK))).toBeLessThanOrEqual(24);
    expect(tohum(3)).toBe(tohum(3));
    for (let i = 0; i < 50; i++) expect(tohum(i)).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 50; i++) expect(tohum(i)).toBeLessThan(1);
  });
});
