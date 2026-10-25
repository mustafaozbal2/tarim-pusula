import { cropEvapotranspiration } from './kc';
import { canDriveAdvice, type ReviewStatus } from './review';
import {
  adjustDepletionFraction,
  dailyBalance,
  readilyAvailableWater,
  totalAvailableWater,
} from './waterBalance';

/**
 * Tasarruf ve verim raporu (G21): geleneksel sulama ile Tarım Pusula'nın FAO-56 su dengesi kuralı,
 * AYNI hava, bitki ve toprak serisi üzerinde karşılaştırılır. Yöntem şeffaftır:
 *  - Hacim: V (m³) = derinlik (mm) × alan (dekar), çünkü 1 mm × 1000 m² = 1 m³.
 *  - Pusula kuralı: gün başı eksik su Dr >= RAW ise tarla kapasitesine dönecek kadar (net Dr) sula.
 *  - Geleneksel: çiftçinin beyan ettiği takvim (her N günde D mm) ya da varsayım. Beyan yoksa
 *    sonuç "tahmin" ve "varsayım" etiketlidir; kanıtlanmış sayılmaz.
 *  - Gerçek ölçüm (cihaz sayacı) varsa hesap yerine o kullanılır ve "ölçülen" etiketi alır.
 *  - Tasarruf, bitkiyi susuz bırakarak elde edilmemelidir: Pusula senaryosundaki su stresi günleri
 *    ayrıca raporlanır (Ks < 1).
 * Kc, toprak, kök derinliği veya p onaylı değilse rapor üretilmez (değişmez kural 1).
 */

export interface SeasonDay {
  /** YYYY-MM-DD */
  date: string;
  /** Referans ET0 (mm/gün). */
  et0: number;
  /** Etkin yağış (mm). */
  rainMm: number;
}

export interface TraditionalSchedule {
  /** Kaç günde bir sulanır. */
  intervalDays: number;
  /** Her sulamada uygulanan derinlik (mm). */
  depthMm: number;
  /** Beyan mı varsayım mı. */
  basis: 'beyan' | 'varsayim';
}

/** Beyan yokken kullanılan yer tutucu takvim. KAYNAĞI YOKTUR: yalnız "varsayım" olarak etiketlenir. */
export const ASSUMED_TRADITIONAL: TraditionalSchedule = {
  intervalDays: 7,
  depthMm: 40,
  basis: 'varsayim',
};

export interface SavingsInput {
  days: readonly SeasonDay[];
  kc: { value: number; reviewStatus: ReviewStatus };
  soil: { thetaFc: number; thetaWp: number; reviewStatus: ReviewStatus };
  rootDepth: { valueM: number; reviewStatus: ReviewStatus };
  p: { value: number; reviewStatus: ReviewStatus };
  areaDecare: number;
  traditional: TraditionalSchedule;
  /** Dönem başı eksik su (mm); varsayılan 0 (tarla kapasitesinde başlar). */
  startDr?: number;
  /** Cihaz sayacından ölçülen Pusula sulama hacmi (m³); varsa hesabın yerine geçer. */
  meteredPusulaM3?: number | null;
  /** Çiftçinin ölçtüğü/beyan ettiği geleneksel toplam hacim (m³); varsa hesabın yerine geçer. */
  meteredTraditionalM3?: number | null;
}

export type SavingsResult =
  | {
      kind: 'none';
      reason: 'uzman-onayi-bekliyor' | 'deger-yok';
      missing: string[];
    }
  | {
      kind: 'report';
      days: number;
      areaDecare: number;
      traditionalMm: number;
      pusulaMm: number;
      traditionalM3: number;
      pusulaM3: number;
      savedM3: number;
      /** Geleneksele göre yüzde; geleneksel 0 ise 0. */
      savedPct: number;
      traditionalBasis: 'olculen' | 'beyan' | 'varsayim';
      pusulaBasis: 'olculen' | 'hesap';
      /** Her iki taraf ölçülen ya da beyan edilen değerse false; aksi halde "tahmin" etiketi gerekir. */
      isEstimate: boolean;
      /** Pusula senaryosunda bitkinin su stresine girdiği gün sayısı (Ks < 1). */
      pusulaStressDays: number;
      traditionalStressDays: number;
      traditionalDeepPercolationMm: number;
      pusulaDeepPercolationMm: number;
      irrigationsPusula: number;
      irrigationsTraditional: number;
      assumptions: string[];
    };

interface SimOut {
  appliedMm: number;
  deepPercolationMm: number;
  stressDays: number;
  events: number;
}

function simulate(
  days: readonly SeasonDay[],
  kc: number,
  taw: number,
  pTable: number,
  dr0: number,
  irrigate: (dayIndex: number, drStart: number, raw: number) => number,
): SimOut {
  let dr = Math.min(taw, Math.max(0, dr0));
  let applied = 0;
  let dp = 0;
  let stress = 0;
  let events = 0;
  days.forEach((d, i) => {
    const etc = cropEvapotranspiration(kc, d.et0);
    const p = adjustDepletionFraction(pTable, etc);
    const raw = readilyAvailableWater(taw, p);
    const irr = Math.max(0, irrigate(i, dr, raw));
    const r = dailyBalance(dr, taw, p, {
      et0: d.et0,
      kc,
      effectiveRainMm: d.rainMm,
      irrigationMm: irr,
    });
    if (irr > 0) events += 1;
    applied += irr;
    dp += r.deepPercolation;
    if (r.ks < 1) stress += 1;
    dr = r.drEnd;
  });
  return { appliedMm: applied, deepPercolationMm: dp, stressDays: stress, events };
}

/**
 * Son sulamadan (ya da dönem başından) beri eksik suyun TAHMİNİ: dönem başında kök bölgesi tarla
 * kapasitesinde (Dr = startDr) kabul edilir, sulama olmadığı varsayılır, yalnız ET ve yağış işlenir.
 * Gerçek sulama kaydı yoksa bu bir tahmindir ve arayüzde öyle etiketlenir.
 */
export function estimateDrEnd(
  days: readonly SeasonDay[],
  p: { kc: number; taw: number; pTable: number; startDr?: number },
): number {
  let dr = Math.min(p.taw, Math.max(0, p.startDr ?? 0));
  for (const d of days) {
    const etc = cropEvapotranspiration(p.kc, d.et0);
    const pp = adjustDepletionFraction(p.pTable, etc);
    dr = dailyBalance(dr, p.taw, pp, { et0: d.et0, kc: p.kc, effectiveRainMm: d.rainMm }).drEnd;
  }
  return dr;
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function computeSavings(i: SavingsInput): SavingsResult {
  const gates: [string, ReviewStatus][] = [
    ['Kc', i.kc.reviewStatus],
    ['toprak', i.soil.reviewStatus],
    ['kök derinliği', i.rootDepth.reviewStatus],
    ['tükenme oranı', i.p.reviewStatus],
  ];
  const unapproved = gates.filter(([, s]) => !canDriveAdvice(s)).map(([n]) => n);
  if (unapproved.length > 0) {
    return { kind: 'none', reason: 'uzman-onayi-bekliyor', missing: unapproved };
  }
  const missing: string[] = [];
  if (i.days.length === 0) missing.push('hava serisi');
  if (!(i.areaDecare > 0)) missing.push('alan');
  if (!(i.traditional.intervalDays >= 1) || !(i.traditional.depthMm >= 0)) {
    missing.push('geleneksel takvim');
  }
  if (missing.length > 0) return { kind: 'none', reason: 'deger-yok', missing };

  const taw = totalAvailableWater(i.soil.thetaFc, i.soil.thetaWp, i.rootDepth.valueM);
  const startDr = i.startDr ?? 0;

  // Pusula kuralı: gün başı Dr >= RAW ise tarla kapasitesine dönecek kadar (Dr) sula.
  const pusula = simulate(i.days, i.kc.value, taw, i.p.value, startDr, (_idx, dr, raw) =>
    dr >= raw ? dr : 0,
  );
  // Geleneksel: her intervalDays günde bir, depthMm (günler 1. gün = indeks 0; N. gün sulanır).
  const interval = Math.floor(i.traditional.intervalDays);
  const trad = simulate(i.days, i.kc.value, taw, i.p.value, startDr, (idx) =>
    (idx + 1) % interval === 0 ? i.traditional.depthMm : 0,
  );

  const toM3 = (mm: number) => mm * i.areaDecare;
  const tradM3 =
    i.meteredTraditionalM3 != null && i.meteredTraditionalM3 >= 0
      ? i.meteredTraditionalM3
      : toM3(trad.appliedMm);
  const pusM3 =
    i.meteredPusulaM3 != null && i.meteredPusulaM3 >= 0
      ? i.meteredPusulaM3
      : toM3(pusula.appliedMm);
  const traditionalBasis: 'olculen' | 'beyan' | 'varsayim' =
    i.meteredTraditionalM3 != null ? 'olculen' : i.traditional.basis;
  const pusulaBasis = i.meteredPusulaM3 != null ? 'olculen' : 'hesap';

  const assumptions = [
    'Hacim = derinlik (mm) × alan (dekar); 1 mm × 1000 m² = 1 m³.',
    'Aynı hava, bitki (Kc), toprak ve kök derinliği iki senaryoda da kullanıldı (FAO-56 su dengesi).',
    `Pusula kuralı: gün başı eksik su, rahat alınabilir suya (RAW) ulaşınca tarla kapasitesine dönecek kadar sulanır.`,
    traditionalBasis === 'varsayim'
      ? `Geleneksel takvim ÇİFTÇİ BEYANI DEĞİL, kaynaksız varsayımdır: her ${interval} günde ${i.traditional.depthMm} mm. Kendi takviminizi girin.`
      : traditionalBasis === 'beyan'
        ? `Geleneksel takvim çiftçi beyanıdır: her ${interval} günde ${i.traditional.depthMm} mm.`
        : 'Geleneksel hacim ölçülen değerdir.',
    pusulaBasis === 'hesap'
      ? 'Pusula hacmi hesaptır (cihaz sayacı yok); uygulanan sulama sayaçla ölçülünce hesabın yerini alır.'
      : 'Pusula hacmi cihaz sayacından ölçülen değerdir.',
    'Yağış etkin yağış olarak verilen değerdir; yüzey akışı ayrıca düşülmedi.',
    'Uygulama verimi (damla/salma farkı) hesaba katılmadı; değerler net sudur.',
  ];

  return {
    kind: 'report',
    days: i.days.length,
    areaDecare: i.areaDecare,
    traditionalMm: round(trad.appliedMm),
    pusulaMm: round(pusula.appliedMm),
    traditionalM3: round(tradM3),
    pusulaM3: round(pusM3),
    savedM3: round(tradM3 - pusM3),
    savedPct: tradM3 > 0 ? round(((tradM3 - pusM3) / tradM3) * 100, 1) : 0,
    traditionalBasis,
    pusulaBasis,
    isEstimate: traditionalBasis === 'varsayim' || pusulaBasis === 'hesap',
    pusulaStressDays: pusula.stressDays,
    traditionalStressDays: trad.stressDays,
    traditionalDeepPercolationMm: round(trad.deepPercolationMm),
    pusulaDeepPercolationMm: round(pusula.deepPercolationMm),
    irrigationsPusula: pusula.events,
    irrigationsTraditional: trad.events,
    assumptions,
  };
}
