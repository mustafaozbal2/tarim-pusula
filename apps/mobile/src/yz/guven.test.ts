import { describe, expect, it } from 'vitest';
import { eminMi, FOTO_IPUCLARI } from './guven';

describe('fotoğraf teşhisi güveni', () => {
  it('%60 ve üstü emin, altı ya da bilinmiyorsa emin değil', () => {
    expect(eminMi({ yuzde: 60, olasilar: [] })).toBe(true);
    expect(eminMi({ yuzde: 59, olasilar: [] })).toBe(false);
    expect(eminMi({ yuzde: null, olasilar: [] })).toBe(false);
  });
  it('ipuçlarında ilaç dozu yok', () => {
    expect(FOTO_IPUCLARI.join(' ')).not.toMatch(/\d+\s*(ml|g|kg|cc|lt)\b/i);
  });
});
