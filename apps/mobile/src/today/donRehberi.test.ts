import { describe, expect, it } from 'vitest';
import { donRehberi } from './donRehberi';

describe('don bilgi notu (FAO 2005)', () => {
  it('her madde kaynaklı; doz/miktar yok; lastik yakma "yapmayın"da', () => {
    for (const c of ['antep-fistigi', 'zeytin', 'domates', null])
      for (const t of ['radyasyon', 'adveksiyon', 'karisik', null] as const) {
        const r = donRehberi(c, t);
        const hepsi = [...r.hemen, ...r.sonra, ...r.yapmayin];
        expect(hepsi.every((y) => y.kaynak.length > 0)).toBe(true);
        expect(JSON.stringify(hepsi)).not.toMatch(/\d+\s*(ml|cc|gr|kg|lt|litre)\b|dozu? /i);
        expect(r.yapmayin.some((y) => /lastik/i.test(y.baslik))).toBe(true);
      }
  });
  it('rüzgârlı (adveksiyon) gecede pervane önerilmez; ağaçta yağmurlama, sebzede örtü', () => {
    expect(
      donRehberi('antep-fistigi', 'adveksiyon').hemen.some((y) => /pervane/i.test(y.baslik)),
    ).toBe(false);
    expect(
      donRehberi('antep-fistigi', 'radyasyon').hemen.some((y) => /pervane/i.test(y.baslik)),
    ).toBe(true);
    expect(donRehberi('domates', null).hemen.some((y) => /Fide ve sebze/.test(y.baslik))).toBe(
      true,
    );
    expect(donRehberi('zeytin', null).grup).toBe('Ağaç ve bahçe');
  });
});
