import { describe, expect, it } from 'vitest';
import {
  FAO56_TABLE22_DRAFT,
  drFromTheta,
  kalmanUpdate,
  normalInverse,
  percentile,
  runScenario,
  runTwinState,
  scorecard,
  twinMode,
  yieldLoss,
  yieldLossFraction,
  yieldModelFor,
  type TwinForecastDay,
  type TwinParams,
} from './twin';
import { totalAvailableWater } from './waterBalance';

/** Tınlı toprak (FAO-56 Tablo 19 orta değer), Zr 1,25 m, p 0,40 → TAW = 1000·0,14·1,25 = 175 mm. */
const P: TwinParams = { kc: 1.0, thetaFc: 0.25, thetaWp: 0.11, rootDepthM: 1.25, pTable: 0.4 };
const day = (i: number, et0 = 5, rainMm = 0) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  et0,
  rainMm,
});
const dry = (n: number, et0 = 5) => Array.from({ length: n }, (_, i) => day(i, et0));

describe('durum motoru (FAO-56 Denk. 85 elle çözüm)', () => {
  it('kuru 5 gün, ET0 5, Kc 1: Dr her gün 5 mm artar (RAW altında Ks = 1)', () => {
    const s = runTwinState(dry(5), P);
    expect(s.end.taw).toBeCloseTo(175, 6);
    // p = 0,40 + 0,04·(5 − 5) = 0,40 → RAW = 70 mm
    expect(s.days[0]!.raw).toBeCloseTo(70, 6);
    expect(s.days.map((d) => d.drEnd)).toEqual([5, 10, 15, 20, 25]);
    expect(s.days.every((d) => d.ks === 1 && !d.stress)).toBe(true);
    expect(s.assumptions.join(' ')).toContain('tarla kapasitesinde');
  });

  it('çiftçinin sulama kaydı eksiği kapatır; fazlası derine sızar', () => {
    const s = runTwinState(dry(3), P, [
      { date: '2026-07-02', kind: 'sulama', mm: 30, source: 'çiftçi' },
    ]);
    // Gün 1: Dr 5. Gün 2: 5 − 30 + 5 = −20 → 0, DP 20. Gün 3: 5.
    expect(s.days.map((d) => d.drEnd)).toEqual([5, 0, 5]);
    expect(s.days[1]!.deepPercolationMm).toBeCloseTo(20, 6);
    expect(s.days[1]!.irrigationMm).toBe(30);
  });

  it('ölçülen yağış kaydı, tahmin yağışının yerine geçer', () => {
    const s = runTwinState([day(0, 5, 10)], P, [
      { date: '2026-07-01', kind: 'yagis', mm: 2, source: 'ölçüm' },
    ]);
    expect(s.days[0]!.rainMm).toBe(2);
    expect(s.days[0]!.drEnd).toBeCloseTo(3, 6);
  });

  it('RAW aşılınca stres: Ks doğrusal düşer ve kullanım azalır', () => {
    // 20 kuru gün × 5 mm → stres olmadan 100 mm; RAW 70 → 15. günden sonra Ks < 1.
    const s = runTwinState(dry(20), P);
    const first = s.days.findIndex((d) => d.stress);
    expect(first).toBe(15); // 15. gün başı Dr = 70 → stres değil (eşit); 16. gün başı 75 > 70
    const d15 = s.days[15]!;
    // Ks = (175 − 75) / ((1 − 0,4)·175) = 100 / 105
    expect(d15.ks).toBeCloseTo(100 / 105, 6);
    expect(d15.etcAdj).toBeCloseTo(5 * (100 / 105), 6);
  });
});

describe('Kalman düzeltmesi (sensör)', () => {
  it('K = P/(P+R): ölçüm kesinse tamamen ölçüme, belirsizse hiç çekilmez', () => {
    expect(kalmanUpdate(10, 4, 20, 0)).toEqual({ x: 20, p: 0, gain: 1 });
    const k = kalmanUpdate(10, 4, 20, 4);
    expect(k.gain).toBeCloseTo(0.5);
    expect(k.x).toBeCloseTo(15);
    expect(k.p).toBeCloseTo(2);
    expect(kalmanUpdate(10, 0, 20, 4).x).toBe(10);
  });

  it('θ ölçümü Dr = 1000(θFC − θ)Zr: 0,17 → 100 mm; TAW ile sınırlı', () => {
    const taw = totalAvailableWater(P.thetaFc, P.thetaWp, P.rootDepthM);
    expect(drFromTheta(0.17, P, taw)).toBeCloseTo(100, 6);
    expect(drFromTheta(0.05, P, taw)).toBe(taw);
    expect(drFromTheta(0.3, P, taw)).toBe(0);
  });

  it('sensör günü Dr ölçüme çekilir ve belirsizlik düşer', () => {
    const noObs = runTwinState(dry(3), P);
    const obs = runTwinState(
      dry(3),
      P,
      [],
      [{ date: '2026-07-02', thetaV: 0.17, source: 'sensör' }],
    );
    const d = obs.days[1]!;
    expect(d.corrected?.drObs).toBeCloseTo(100, 6);
    expect(d.corrected!.gain).toBeGreaterThan(0);
    expect(d.corrected!.gain).toBeLessThan(1);
    expect(d.drEnd).toBeGreaterThan(noObs.days[1]!.drEnd);
    expect(d.drEnd).toBeLessThan(100);
    expect(d.sigmaMm).toBeLessThan(noObs.days[1]!.sigmaMm);
  });
});

describe('yüzdelikler ve normal ters', () => {
  it('tip 7 yüzdelik: 1..10 için p10 = 1,9, p50 = 5,5, p90 = 9,1', () => {
    const xs = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(percentile(xs, 0.1)).toBeCloseTo(1.9);
    expect(percentile(xs, 0.5)).toBeCloseTo(5.5);
    expect(percentile(xs, 0.9)).toBeCloseTo(9.1);
  });
  it('Φ⁻¹(0,5) = 0, Φ⁻¹(0,975) ≈ 1,96, simetrik', () => {
    expect(normalInverse(0.5)).toBeCloseTo(0, 9);
    expect(normalInverse(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalInverse(0.025)).toBeCloseTo(-1.959964, 5);
    expect(normalInverse(0.01)).toBeCloseTo(-2.326348, 5);
  });
});

const forecast = (n: number, members: { et0: number; rainMm: number }[][]): TwinForecastDay[] =>
  Array.from({ length: n }, (_, i) => ({ ...day(i), members: members[i] ?? [] }));

describe('senaryolar (topluluk)', () => {
  it('tek üye, "yok" planı: Dr her gün ETc kadar artar; su 0', () => {
    const r = runScenario(forecast(3, []), P, { dr: 20, sigmaMm: 0 }, { kind: 'yok' });
    expect(r.days.map((d) => d.dr.p50)).toEqual([25, 30, 35]);
    expect(r.waterMm.p50).toBe(0);
    expect(r.irrigations).toBe(0);
    expect(r.members).toBe(1);
  });

  it('"aralik": her 2 günde 10 mm → 0. ve 2. günde sulama', () => {
    const r = runScenario(
      forecast(4, []),
      P,
      { dr: 20, sigmaMm: 0 },
      { kind: 'aralik', everyDays: 2, depthMm: 10 },
    );
    expect(r.days.map((d) => d.irrigationMm)).toEqual([10, 0, 10, 0]);
    expect(r.waterMm.p50).toBe(20);
    expect(r.irrigations).toBe(2);
    // Dr: 20 − 10 + 5 = 15; 20; 15; 20
    expect(r.days.map((d) => d.dr.p50)).toEqual([15, 20, 15, 20]);
  });

  it('"simdi": ilk gün tarla kapasitesine doldurur (Dr kadar su)', () => {
    const r = runScenario(
      forecast(2, []),
      P,
      { dr: 80, sigmaMm: 0 },
      { kind: 'simdi', fraction: 1 },
    );
    expect(r.days[0]!.irrigationMm).toBe(80);
    // Ks gün başı Dr (80 > RAW 70) ile: (175 − 80)/105; kullanım 5·Ks
    expect(r.days[0]!.dr.p50).toBeCloseTo(5 * (95 / 105), 6);
  });

  it('"kural": Dr RAW\'a (70) ulaşınca doldurur; "bekle 2" o günleri atlar', () => {
    const kural = runScenario(forecast(3, []), P, { dr: 70, sigmaMm: 0 }, { kind: 'kural' });
    expect(kural.days[0]!.irrigationMm).toBe(70);
    const bekle = runScenario(
      forecast(3, []),
      P,
      { dr: 70, sigmaMm: 0 },
      { kind: 'bekle', days: 2 },
    );
    // Gün 0: 70 → 75 (Ks 1); gün 1: Ks 100/105 → 79,76; gün 2: kural o kadar su verir.
    expect(bekle.days.map((d) => d.irrigationMm)).toEqual([0, 0, expect.closeTo(79.7619, 3)]);
    expect(bekle.stressDays.p50).toBe(2);
  });

  it('üyeler arası fark aralığa dönüşür; yağışlı üye eksiği düşürür', () => {
    const m = [
      [
        { et0: 5, rainMm: 0 },
        { et0: 5, rainMm: 0 },
        { et0: 5, rainMm: 20 },
      ],
      [
        { et0: 5, rainMm: 0 },
        { et0: 5, rainMm: 0 },
        { et0: 5, rainMm: 0 },
      ],
    ];
    const r = runScenario(forecast(2, m), P, { dr: 20, sigmaMm: 0 }, { kind: 'yok' });
    expect(r.members).toBe(3);
    // Üyeler [5, 25, 25]: tip 7 p10 = 5 + 0,2·20 = 9; p90 = 25.
    expect(r.days[0]!.dr.p10).toBeCloseTo(9, 6);
    expect(r.days[0]!.dr.p90).toBeCloseTo(25, 6);
  });

  it('başlangıç belirsizliği üyelere dağıtılır (katmanlı normal)', () => {
    const r = runScenario(
      forecast(1, [Array(5).fill({ et0: 5, rainMm: 0 })]),
      P,
      { dr: 50, sigmaMm: 10 },
      { kind: 'yok' },
    );
    expect(r.days[0]!.dr.p50).toBeCloseTo(55, 6);
    expect(r.days[0]!.dr.p10).toBeLessThan(55);
    expect(r.days[0]!.dr.p90).toBeGreaterThan(55);
  });
});

describe('verim-su', () => {
  it('FAO-33 doğrusal: mısır Ky 1,25, ETa/ETx 0,8 → %25 kayıp; sınır 0..1', () => {
    const m = yieldModelFor('misir-tane');
    expect(m.kind === 'ky' && m.basis).toBe('kaynak');
    expect(yieldLossFraction(m, 0.8)).toBeCloseTo(0.25, 9);
    expect(yieldLossFraction(m, 1)).toBe(0);
    expect(yieldLossFraction(m, 0)).toBe(1);
  });
  it('zeytin eğrisi (FAO-66 Tablo 2): 0,754 → kayıp yok; 0,563 → %10; arada doğrusal', () => {
    const m = yieldModelFor('zeytin');
    expect(yieldLossFraction(m, 1)).toBe(0);
    expect(yieldLossFraction(m, 0.754)).toBeCloseTo(0, 9);
    expect(yieldLossFraction(m, 0.563)).toBeCloseTo(0.1, 9);
    expect(yieldLossFraction(m, (0.563 + 0.754) / 2)).toBeCloseTo(0.05, 9);
  });
  it('kaynaksız ürün: Ky = 1 varsayımı etiketli', () => {
    const m = yieldModelFor('antep-fistigi');
    expect(m.kind === 'ky' && m.basis).toBe('varsayim');
    expect(yieldModelFor(null).kind).toBe('ky');
  });
  it('yüzdelikler ters eşlenir: oran p10 → kayıp p90', () => {
    const y = yieldLoss(yieldModelFor('bugday'), { p10: 0.6, p50: 0.8, p90: 1 });
    expect(y.fraction).toEqual({
      p10: 0,
      p50: expect.closeTo(0.2, 9),
      p90: expect.closeTo(0.4, 9),
    });
    expect(y.caveat).toContain('risk');
  });
});

describe('kip, karne, taslak tablo', () => {
  it('hepsi onaylı → öneri; biri taslak → bilgi ve rozet', () => {
    expect(
      twinMode({ kc: 'uzman-onayli', soil: 'uzman-onayli', waterParams: 'uzman-onayli' }),
    ).toEqual({ mode: 'oneri', badge: false, unapproved: [] });
    const m = twinMode({
      kc: 'uzman-onayli',
      soil: 'taslak-uzman-onayi-bekliyor',
      waterParams: 'uzman-onayli',
    });
    expect(m.mode).toBe('bilgi');
    expect(m.badge).toBe(true);
    expect(m.unapproved).toEqual(['toprak']);
  });
  it('karne: MAE, kapsama ve yanlılık', () => {
    const s = scorecard([
      { issuedOn: 'a', targetDate: 'b', predicted: { p10: 10, p50: 20, p90: 30 }, actual: 25 },
      { issuedOn: 'a', targetDate: 'c', predicted: { p10: 10, p50: 20, p90: 30 }, actual: 40 },
    ]);
    expect(s.count).toBe(2);
    expect(s.maeMm).toBeCloseTo(12.5);
    expect(s.coverage).toBe(0.5);
    expect(s.biasMm).toBeCloseTo(-12.5);
    expect(scorecard([]).count).toBe(0);
  });
  it('FAO-56 Tablo 22 taslakları onaysız ve kaynaklı', () => {
    const z = FAO56_TABLE22_DRAFT['zeytin']!;
    expect(z.reviewStatus).toBe('taslak-uzman-onayi-bekliyor');
    expect(z.source).toContain('FAO-56 Tablo 22');
    expect(z.pTable).toBe(0.65);
    expect(FAO56_TABLE22_DRAFT['elma-kiraz-armut']!.rootDepthM).toBe(1.5);
  });
});
