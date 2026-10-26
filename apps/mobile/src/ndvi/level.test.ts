import { describe, expect, it } from 'vitest';
import { ndviLevel } from './level';

describe('NDVI çiftçi dili (G23.17)', () => {
  it('aralıklar: çıplak < 0,2 ≤ seyrek < 0,4 ≤ orta < 0,6 ≤ gür', () => {
    expect(ndviLevel(0.1).key).toBe('ciplak');
    expect(ndviLevel(0.2).key).toBe('seyrek');
    expect(ndviLevel(0.45).key).toBe('orta');
    expect(ndviLevel(0.6).key).toBe('gur');
    expect(ndviLevel(0.85).text).toBe('Gür yeşil');
  });
});
