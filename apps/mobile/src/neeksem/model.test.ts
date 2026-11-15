import { describe, expect, it } from 'vitest';
import type { NeEksemRankedDto } from '../api/client';
import {
  agacSatiri,
  bantRengi,
  bolgeBasligi,
  dengeCumlesi,
  fiyatSatiri,
  ilkUcPaylari,
  niyetDogrula,
  niyetSatiri,
} from './model';

const r = (o: Partial<NeEksemRankedDto>): NeEksemRankedDto => ({
  cropId: 'x',
  name: 'X',
  lifespan: 'yillik',
  gap: 0.1,
  band: 'acik',
  bandLabel: 'Açık var',
  bar: 0.6,
  score: 0.1,
  confidence: 'temel',
  inDistrictPlan: false,
  inProvincePlan: false,
  suitability: null,
  priceTrend: null,
  restricted: null,
  reasons: [],
  balanceSource: null,
  intents: { decare: 0, count: 0 },
  remainingQuota: null,
  mine: null,
  ...o,
});

describe('denge cümlesi', () => {
  it('bantlara göre çiftçi dili', () => {
    expect(dengeCumlesi({ gap: 0.368, band: 'acik-buyuk' })).toContain('%37');
    expect(dengeCumlesi({ gap: 0.154, band: 'acik' })).toContain('açık var');
    expect(dengeCumlesi({ gap: -0.045, band: 'dengede' })).toContain('dengede');
    expect(dengeCumlesi({ gap: -0.175, band: 'fazla' })).toContain('%18 fazla');
    expect(dengeCumlesi({ gap: -4.949, band: 'cok-fazla' })).toContain('595%');
    expect(dengeCumlesi({ gap: null, band: null })).toBe('Denge verisi yok');
  });
  it('renk', () => {
    expect(bantRengi('acik-buyuk')).toBe('yesil');
    expect(bantRengi('dengede')).toBe('altin');
    expect(bantRengi('cok-fazla')).toBe('kiremit');
    expect(bantRengi(null)).toBe('gri');
  });
});

describe('ilk üç payı', () => {
  it('puan oranında; toplam 100', () => {
    expect(
      ilkUcPaylari([r({ score: 0.5 }), r({ score: 0.3 }), r({ score: 0.2 }), r({ score: 0.1 })]),
    ).toEqual([50, 30, 20]);
    expect(
      ilkUcPaylari([r({ score: 0.419 }), r({ score: 0.368 }), r({ score: 0.154 })]).reduce(
        (a, b) => a + b,
        0,
      ),
    ).toBe(100);
    expect(ilkUcPaylari([r({ score: -0.1 }), r({ score: -0.2 })])).toEqual([50, 50]);
    expect(ilkUcPaylari([])).toEqual([]);
  });
});

describe('satırlar', () => {
  it('ağaç ve kısıt', () => {
    expect(agacSatiri({ lifespan: 'yillik', restricted: null })).toBeNull();
    expect(agacSatiri({ lifespan: 'cok-yillik', restricted: null })).toContain('yıllar alır');
    expect(
      agacSatiri({
        lifespan: 'cok-yillik',
        restricted: { rule: 'yeni-bahce-kisitli', source: 's', reviewStatus: 'taslak' },
      }),
    ).toContain('kısıtlı');
  });
  it('niyet ve fiyat', () => {
    expect(niyetSatiri({ intents: { decare: 32, count: 2 }, mine: 12, remainingQuota: null })).toBe(
      'Bölgende 2 çiftçi toplam 32 dekar niyet bildirdi · senin beyanın 12 dekar',
    );
    expect(
      niyetSatiri({ intents: { decare: 0, count: 0 }, mine: null, remainingQuota: 500 }),
    ).toContain('kalan kota ≈ 500');
    expect(fiyatSatiri(null)).toBeNull();
    expect(fiyatSatiri(0.01)).toContain('aynı seviyede');
    expect(fiyatSatiri(0.12)).toBe('Hal fiyatı geçen yıla göre +12%');
    expect(fiyatSatiri(-0.2)).toBe('Hal fiyatı geçen yıla göre -20%');
  });
  it('bölge başlığı', () => {
    expect(
      bolgeBasligi({
        province: 'Gaziantep',
        district: 'Nizip',
        plan: { district: true, provinceRows: 9, source: null, date: null },
      }),
    ).toBe('Gaziantep · Nizip (ilçe için resmî ürün deseni var)');
    expect(
      bolgeBasligi({
        province: null,
        district: null,
        plan: { district: false, provinceRows: 0, source: null, date: null },
      }),
    ).toContain('Konum bilinmiyor');
  });
  it('niyet doğrulama', () => {
    expect(niyetDogrula('12,5', 20)).toEqual({ ok: true, dekar: 12.5 });
    expect(niyetDogrula('abc', 20).ok).toBe(false);
    expect(niyetDogrula('25', 20).ok).toBe(false);
    expect(niyetDogrula('25', null)).toEqual({ ok: true, dekar: 25 });
  });
});
