import { describe, expect, it } from 'vitest';
import { kcLevel, soilStars } from './load';

describe('bilgi listeleri çiftçi dili (G23.16)', () => {
  it('Kc düzeyi: az, orta, çok', () => {
    expect(kcLevel(0.4)).toBe('az');
    expect(kcLevel(0.75)).toBe('orta');
    expect(kcLevel(1.15)).toBe('çok');
    expect(kcLevel(null)).toBeNull();
  });
  it('toprak su tutma yıldızı: kumlu az, tınlı/killi çok', () => {
    expect(soilStars(0.12, 0.045)).toBe(1); // kumlu: 75 mm/m
    expect(soilStars(0.23, 0.11)).toBe(3); // kumlu tın: 120 mm/m
    expect(soilStars(0.25, 0.11)).toBe(4); // tınlı: 140 mm/m
    expect(soilStars(0.36, 0.22)).toBe(4); // killi: 140 mm/m
    expect(soilStars(0.32, 0.17)).toBe(4); // silt: 150 mm/m
  });
});
