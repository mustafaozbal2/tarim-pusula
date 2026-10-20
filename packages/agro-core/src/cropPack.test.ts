import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frostAdvice, parseCsv, parseKcSeed, waterNeedAdvice, type CropPack } from './cropPack';

const seed = readFileSync(new URL('../../../data/kc_fao56_seed.csv', import.meta.url), 'utf8');

describe('CSV ve Kc tohumu', () => {
  it('tırnaklı alan ve çift tırnak', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3\r\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('tohum dosyası 33 satır; hepsi taslak', () => {
    const rows = parseKcSeed(seed);
    expect(rows).toHaveLength(33);
    expect(rows.every((r) => r.reviewStatus === 'taslak-uzman-onayi-bekliyor')).toBe(true);
    const arpa = rows.find((r) => r.cropTr === 'Arpa')!;
    expect([arpa.kcIni, arpa.kcMid, arpa.kcEnd]).toEqual([0.3, 1.15, 0.25]);
  });

  it('aralıklı Kc ("0.25-0.4") alt ve üst sınırı ayrı tutar', () => {
    const w = parseKcSeed(seed).find((r) => r.cropTr === 'Yazlik bugday')!;
    expect(w.kcEnd).toBe(0.25);
    expect(w.kcEndMax).toBe(0.4);
  });

  it('bozuk değeri reddeder', () => {
    const bad = seed.replace('Arpa,Barley,0.3', 'Arpa,Barley,abc');
    expect(() => parseKcSeed(bad)).toThrow(/Geçersiz Kc/);
  });
});

const approvedPack: CropPack = {
  cropId: 'zeytin',
  version: 1,
  reviewStatus: 'uzman-onayli',
  kcIni: 0.65,
  kcMid: 0.7,
  kcEnd: 0.7,
  kcEndMax: null,
  stages: [],
  source: 'test',
  sourceVersion: '1',
  retrievedAt: '2026-10-20T00:00:00Z',
};

describe('onaysız veri karar üretmez (değişmez kural 1)', () => {
  it('taslak pakette su ihtiyacı sayısı üretilmez', () => {
    const draft = { ...approvedPack, reviewStatus: 'taslak-uzman-onayi-bekliyor' as const };
    const r = waterNeedAdvice(draft, undefined, 6);
    expect(r).toEqual({ kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true });
  });

  it('tohumdaki hiçbir satır, hangi hava değeriyle olursa olsun sayı üretmez', () => {
    for (const row of parseKcSeed(seed)) {
      const pack = { reviewStatus: row.reviewStatus, kcMid: row.kcMid };
      for (const et0 of [0, 2, 6, 12]) {
        expect(waterNeedAdvice(pack, undefined, et0).kind).toBe('none');
      }
    }
  });

  it('paket onaylı olsa bile onaysız evre değeri kullanılmaz', () => {
    const stage = { kc: 0.9, reviewStatus: 'taslak-uzman-onayi-bekliyor' as const };
    expect(waterNeedAdvice(approvedPack, stage, 5).kind).toBe('none');
  });

  it('onaysız don eşiği, sıcaklık ne kadar düşük olursa olsun uyarı üretmez', () => {
    const stage = { frostCriticalC: -2, reviewStatus: 'taslak-uzman-onayi-bekliyor' as const };
    for (const t of [5, 0, -2, -10, -30]) {
      expect(frostAdvice(stage, t)).toEqual({
        kind: 'none',
        reason: 'uzman-onayi-bekliyor',
        badge: true,
      });
    }
  });

  it('onaylı değerlerle hesap yapılır', () => {
    const w = waterNeedAdvice(approvedPack, undefined, 5);
    expect(w).toEqual({ kind: 'water-need', kc: 0.7, etcMmPerDay: 3.5 });
    const stage = { frostCriticalC: -2, reviewStatus: 'uzman-onayli' as const };
    expect(frostAdvice(stage, -3)).toEqual({ kind: 'frost', atRisk: true, thresholdC: -2 });
    expect(frostAdvice(stage, 1)).toEqual({ kind: 'frost', atRisk: false, thresholdC: -2 });
  });

  it('onaylı ama değeri olmayan evre uyarı üretmez', () => {
    const stage = { frostCriticalC: null, reviewStatus: 'uzman-onayli' as const };
    expect(frostAdvice(stage, -40)).toEqual({ kind: 'none', reason: 'deger-yok', badge: false });
  });
});
