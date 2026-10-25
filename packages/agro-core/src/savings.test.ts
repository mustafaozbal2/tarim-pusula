import { describe, expect, it } from 'vitest';
import {
  ASSUMED_TRADITIONAL,
  computeSavings,
  estimateDrEnd,
  type SavingsInput,
  type SeasonDay,
} from './savings';

const OK = 'uzman-onayli' as const;
const DRAFT = 'taslak-uzman-onayi-bekliyor' as const;

/** 30 gün, ET0 = 5 mm/gün, yağış yok. */
const days = (n = 30, et0 = 5, rain: Record<number, number> = {}): SeasonDay[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    et0,
    rainMm: rain[i] ?? 0,
  }));

/**
 * El hesabı örneği. θFC = 0,375, θWP = 0,125, Zr = 0,4 m:
 *   TAW = 1000 (0,375 − 0,125) 0,4 = 100 mm. Kc = 1, ET0 = 5 ⇒ ETc = 5 mm/gün.
 *   p = 0,5 + 0,04 (5 − 5) = 0,5 ⇒ RAW = 50 mm.
 */
const base = (over: Partial<SavingsInput> = {}): SavingsInput => ({
  days: days(),
  kc: { value: 1, reviewStatus: OK },
  soil: { thetaFc: 0.375, thetaWp: 0.125, reviewStatus: OK },
  rootDepth: { valueM: 0.4, reviewStatus: OK },
  p: { value: 0.5, reviewStatus: OK },
  areaDecare: 10,
  traditional: { intervalDays: 5, depthMm: 40, basis: 'beyan' },
  ...over,
});

describe('computeSavings: el hesabı örneği', () => {
  const r = computeSavings(base());
  it('rapor üretilir', () => {
    expect(r.kind).toBe('report');
  });

  it('Pusula: Dr her gün 5 mm artar; 11. günün başında Dr = 50 = RAW ⇒ 50 mm; 21. günde yine 50 mm ⇒ toplam 100 mm', () => {
    if (r.kind !== 'report') throw new Error();
    expect(r.pusulaMm).toBe(100);
    expect(r.irrigationsPusula).toBe(2);
    expect(r.pusulaDeepPercolationMm).toBe(0);
    expect(r.pusulaStressDays).toBe(0);
  });

  it('Geleneksel: 5., 10., ... 30. günde 40 mm = 6 × 40 = 240 mm; her sulamada 20 + 5 − 40 = −15 ⇒ 15 mm derine sızma (toplam 90)', () => {
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalMm).toBe(240);
    expect(r.irrigationsTraditional).toBe(6);
    expect(r.traditionalDeepPercolationMm).toBe(90);
    expect(r.traditionalStressDays).toBe(0);
  });

  it('hacimler (10 dekar): 240 mm × 10 = 2400 m³, 100 mm × 10 = 1000 m³; tasarruf 1400 m³ = %58,3', () => {
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalM3).toBe(2400);
    expect(r.pusulaM3).toBe(1000);
    expect(r.savedM3).toBe(1400);
    expect(r.savedPct).toBe(58.3);
  });

  it('etiketler: beyan + hesap ⇒ tahmin', () => {
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalBasis).toBe('beyan');
    expect(r.pusulaBasis).toBe('hesap');
    expect(r.isEstimate).toBe(true);
  });

  it('varsayımlar yazılıdır (hacim formülü, aynı hava, verim hesaba katılmadı)', () => {
    if (r.kind !== 'report') throw new Error();
    const text = r.assumptions.join(' ');
    expect(text).toContain('1 mm × 1000 m² = 1 m³');
    expect(text).toContain('FAO-56');
    expect(text).toContain('Uygulama verimi');
  });
});

describe('beyan yoksa varsayım etiketi', () => {
  it('ASSUMED_TRADITIONAL "varsayim" taşır ve metinde kaynaksız olduğu yazılır', () => {
    const r = computeSavings(base({ traditional: ASSUMED_TRADITIONAL }));
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalBasis).toBe('varsayim');
    expect(r.isEstimate).toBe(true);
    expect(r.assumptions.join(' ')).toContain('kaynaksız varsayım');
  });
});

describe('gerçek ölçüm varsa hesabın yerini alır', () => {
  it('Pusula hacmi sayaçtan: 800 m³ ⇒ tasarruf 1600 m³ (%66,7), pusulaBasis "olculen"', () => {
    const r = computeSavings(base({ meteredPusulaM3: 800 }));
    if (r.kind !== 'report') throw new Error();
    expect(r.pusulaM3).toBe(800);
    expect(r.pusulaBasis).toBe('olculen');
    expect(r.savedM3).toBe(1600);
    expect(r.savedPct).toBe(66.7);
  });
  it('iki taraf da ölçülü ise tahmin değildir', () => {
    const r = computeSavings(base({ meteredPusulaM3: 800, meteredTraditionalM3: 2000 }));
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalBasis).toBe('olculen');
    expect(r.isEstimate).toBe(false);
    expect(r.savedPct).toBe(60);
  });
  it('ölçülen 0 m³ geçerli bir ölçümdür (hesaba düşmez)', () => {
    const r = computeSavings(base({ meteredPusulaM3: 0 }));
    if (r.kind !== 'report') throw new Error();
    expect(r.pusulaM3).toBe(0);
  });
});

describe('tasarruf bitkiyi susuz bırakarak elde edilmemeli', () => {
  it('geleneksel takvim az suluyorsa (10 günde 20 mm) kendi stres günleri raporlanır; Pusula stressiz', () => {
    const r = computeSavings(
      base({ traditional: { intervalDays: 10, depthMm: 20, basis: 'beyan' } }),
    );
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalStressDays).toBeGreaterThan(0);
    expect(r.pusulaStressDays).toBe(0);
    // Geleneksel az su vermiş: Pusula daha çok su kullanabilir, tasarruf negatif çıkabilir ve öyle gösterilir.
    expect(r.savedM3).toBe(r.traditionalM3 - r.pusulaM3);
  });
  it('yağışlı dönemde Pusula daha az sular (20 mm yağış 3. günde)', () => {
    const dry = computeSavings(base());
    const wet = computeSavings(base({ days: days(30, 5, { 2: 20 }) }));
    if (dry.kind !== 'report' || wet.kind !== 'report') throw new Error();
    expect(wet.pusulaMm).toBeLessThanOrEqual(dry.pusulaMm);
  });
});

describe('kapılar', () => {
  it('Kc, toprak, kök derinliği veya p onaysızsa rapor yok (kural 1)', () => {
    const cases: Partial<SavingsInput>[] = [
      { kc: { value: 1, reviewStatus: DRAFT } },
      { soil: { thetaFc: 0.375, thetaWp: 0.125, reviewStatus: DRAFT } },
      { rootDepth: { valueM: 0.4, reviewStatus: DRAFT } },
      { p: { value: 0.5, reviewStatus: DRAFT } },
    ];
    for (const c of cases) {
      const r = computeSavings(base(c));
      expect(r).toMatchObject({ kind: 'none', reason: 'uzman-onayi-bekliyor' });
    }
  });
  it('hava serisi, alan ya da geleneksel takvim yoksa "deger-yok"', () => {
    expect(computeSavings(base({ days: [] }))).toMatchObject({ kind: 'none', reason: 'deger-yok' });
    expect(computeSavings(base({ areaDecare: 0 }))).toMatchObject({
      kind: 'none',
      reason: 'deger-yok',
    });
    expect(
      computeSavings(base({ traditional: { intervalDays: 0, depthMm: 40, basis: 'beyan' } })),
    ).toMatchObject({ kind: 'none', reason: 'deger-yok' });
  });
  it('geleneksel hiç sulamıyorsa yüzde 0 bölünmez', () => {
    const r = computeSavings(
      base({ traditional: { intervalDays: 100, depthMm: 0, basis: 'beyan' } }),
    );
    if (r.kind !== 'report') throw new Error();
    expect(r.traditionalM3).toBe(0);
    expect(r.savedPct).toBe(0);
  });
});

describe('estimateDrEnd (son sulamadan beri tahmini eksik su)', () => {
  const p = { kc: 1, taw: 100, pTable: 0.5 };
  it('sulamasız 4 gün, ETc = 5 mm/gün: Dr = 20 mm (el hesabı)', () => {
    expect(estimateDrEnd(days(4), p)).toBe(20);
  });
  it('yağış eksik suyu azaltır: 3. gün 12 mm ⇒ 15 − 12 + 5 = 8', () => {
    // 1. ve 2. gün sonu 5, 10; 3. gün: 10 − 12 + 5 = 3; 4. gün: 8
    expect(estimateDrEnd(days(4, 5, { 2: 12 }), p)).toBe(8);
  });
  it('Dr kapasiteyi aşan yağışla 0 olur, TAW değerini aşmaz', () => {
    expect(estimateDrEnd(days(1, 5, { 0: 80 }), p)).toBe(0);
    expect(estimateDrEnd(days(100, 5), p)).toBeLessThanOrEqual(100);
  });
});
