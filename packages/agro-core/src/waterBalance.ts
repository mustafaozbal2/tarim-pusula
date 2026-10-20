import { cropEvapotranspiration } from './kc';
import { canDriveAdvice, needsDraftBadge, type ReviewStatus } from './review';

/**
 * FAO-56 (Allen vd., 1998) kök bölgesi su dengesi. Tüm birimler mm (derinlik) ya da mm/gün.
 * Dr = kök bölgesinin tarla kapasitesine göre eksik suyu (0 = dolu, TAW = solma noktası).
 */

/** TAW = 1000 (θFC − θWP) Zr (Denklem 82). θ: m³/m³, Zr: m. */
export function totalAvailableWater(thetaFc: number, thetaWp: number, rootDepthM: number): number {
  if (!(thetaFc > thetaWp) || thetaWp < 0 || thetaFc > 1) {
    throw new RangeError(`θFC (${thetaFc}) θWP'den (${thetaWp}) büyük olmalı, 0..1 arası`);
  }
  if (!(rootDepthM > 0)) throw new RangeError('Kök derinliği pozitif olmalı');
  return 1000 * (thetaFc - thetaWp) * rootDepthM;
}

/** RAW = p · TAW (Denklem 83). */
export function readilyAvailableWater(taw: number, p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p 0 ile 1 arasında olmalı');
  return p * taw;
}

/** Tablo değeri p'nin ETc'ye göre düzeltmesi: p = pTablo + 0,04 (5 − ETc), 0,1..0,8 arası (FAO-56 Tablo 22 notu). */
export function adjustDepletionFraction(pTable: number, etcMmPerDay: number): number {
  return Math.min(0.8, Math.max(0.1, pTable + 0.04 * (5 - etcMmPerDay)));
}

/** Su stresi katsayısı Ks (Denklem 84): Dr <= RAW ise 1, değilse (TAW − Dr) / ((1 − p) TAW); 0..1. */
export function waterStressCoefficient(dr: number, taw: number, p: number): number {
  if (dr <= p * taw) return 1;
  return Math.max(0, Math.min(1, (taw - dr) / ((1 - p) * taw)));
}

export interface DailyInput {
  /** Referans ET0, mm/gün. */
  et0: number;
  /** Bitki katsayısı Kc. */
  kc: number;
  /** Etkin yağış (yüzey akışı düşülmüş), mm. */
  effectiveRainMm?: number;
  /** Net sulama derinliği, mm. */
  irrigationMm?: number;
  /** Kılcal yükselme, mm (varsayılan 0). */
  capillaryRiseMm?: number;
}

export interface DailyResult {
  drStart: number;
  /** Gün sonu eksik su (0..TAW). */
  drEnd: number;
  ks: number;
  /** Gerilmesiz bitki su kullanımı Kc·ET0. */
  etc: number;
  /** Gerilmeli gerçek kullanım Ks·Kc·ET0. */
  etcAdj: number;
  /** Derine sızma (Denklem 88): kök bölgesi dolduktan sonra taşan su. */
  deepPercolation: number;
}

/**
 * Bir günlük denge (Denklem 85): Dr,i = Dr,i-1 − (P−RO) − I − CR + ETc,adj + DP.
 * Ks gün başındaki Dr ile hesaplanır. Dr, [0, TAW] aralığına sınırlanır; taşan su DP olur.
 */
export function dailyBalance(drPrev: number, taw: number, p: number, d: DailyInput): DailyResult {
  if (drPrev < 0 || drPrev > taw) {
    throw new RangeError(`Dr 0..TAW (${taw}) arasında olmalı: ${drPrev}`);
  }
  const rain = d.effectiveRainMm ?? 0;
  const irr = d.irrigationMm ?? 0;
  const cr = d.capillaryRiseMm ?? 0;
  if (rain < 0 || irr < 0 || cr < 0) {
    throw new RangeError('Yağış, sulama, kılcal yükselme negatif olamaz');
  }
  const ks = waterStressCoefficient(drPrev, taw, p);
  const etc = cropEvapotranspiration(d.kc, d.et0);
  const etcAdj = ks * etc;
  const raw = drPrev - rain - irr - cr + etcAdj;
  const deepPercolation = Math.max(0, -raw);
  const drEnd = Math.min(taw, Math.max(0, raw));
  return { drStart: drPrev, drEnd, ks, etc, etcAdj, deepPercolation };
}

/** Taslak toprak su parametreleri (FAO-56 Tablo 19 aralıklarının orta değeri). Onaysızdır; öneri üretmez. */
export interface SoilWater {
  key: string;
  nameTr: string;
  thetaFc: number;
  thetaWp: number;
  source: string;
  reviewStatus: ReviewStatus;
}

export const SOIL_SEED: SoilWater[] = [
  { key: 'kumlu', nameTr: 'Kumlu toprak', thetaFc: 0.12, thetaWp: 0.045 },
  { key: 'tinli', nameTr: 'Tınlı toprak', thetaFc: 0.25, thetaWp: 0.11 },
  { key: 'killi', nameTr: 'Killi toprak', thetaFc: 0.36, thetaWp: 0.22 },
].map((s) => ({
  ...s,
  source: 'FAO-56 Tablo 19 (aralık orta değeri)',
  reviewStatus: 'taslak-uzman-onayi-bekliyor' as ReviewStatus,
}));

export interface IrrigationInput {
  kc: { value: number; reviewStatus: ReviewStatus };
  soil: Pick<SoilWater, 'thetaFc' | 'thetaWp' | 'reviewStatus'>;
  /** Kök derinliği Zr (m). */
  rootDepth: { valueM: number; reviewStatus: ReviewStatus };
  /** Tükenme oranı p (tablo değeri, ETc düzeltmesinden önce). */
  p: { value: number; reviewStatus: ReviewStatus };
  /** Dünkü gün sonu eksik su (mm). Bilinmiyorsa null: öneri verilmez. */
  drYesterday: number | null;
  /** Bugünkü ET0 (mm/gün). */
  et0: number;
  /** Bugün beklenen etkin yağış (mm). */
  forecastRainMm: number;
}

export interface Step {
  label: string;
  formula: string;
  value: number;
  unit: string;
}

export type IrrigationDecision =
  | {
      kind: 'none';
      reason: 'uzman-onayi-bekliyor' | 'deger-yok';
      badge: boolean;
      /** Hangi girdi kapıyı kapattı. */
      missing: string[];
    }
  | {
      kind: 'irrigate' | 'skip';
      /** 'irrigate' için tarla kapasitesine dönmek üzere net su derinliği (mm); 'skip' için 0. */
      netDepthMm: number;
      /** Bugün başında bitki zaten su sıkıntısında mı (Dr > RAW). */
      stressToday: boolean;
      reason: string;
      steps: Step[];
    };

/**
 * Kural: gün başı eksik su Dr, kolay alınabilir suya (RAW) ulaştıysa ya da bugünkü kayıptan
 * (Ks·ETc − yağış) sonra ulaşacaksa sula; aksi halde sulama. Bir girdi onaysız / eksikse öneri YOK.
 */
export function decideIrrigation(i: IrrigationInput): IrrigationDecision {
  const gates: [string, ReviewStatus][] = [
    ['Kc', i.kc.reviewStatus],
    ['toprak', i.soil.reviewStatus],
    ['kök derinliği', i.rootDepth.reviewStatus],
    ['tükenme oranı', i.p.reviewStatus],
  ];
  const unapproved = gates.filter(([, s]) => !canDriveAdvice(s)).map(([n]) => n);
  if (unapproved.length > 0) {
    return {
      kind: 'none',
      reason: 'uzman-onayi-bekliyor',
      badge: gates.some(([, s]) => needsDraftBadge(s)),
      missing: unapproved,
    };
  }
  if (i.drYesterday === null || !Number.isFinite(i.drYesterday)) {
    return { kind: 'none', reason: 'deger-yok', badge: false, missing: ['toprak su durumu'] };
  }

  const taw = totalAvailableWater(i.soil.thetaFc, i.soil.thetaWp, i.rootDepth.valueM);
  const etc = cropEvapotranspiration(i.kc.value, i.et0);
  const p = adjustDepletionFraction(i.p.value, etc);
  const raw = readilyAvailableWater(taw, p);
  const dr0 = Math.min(taw, Math.max(0, i.drYesterday));
  const ks = waterStressCoefficient(dr0, taw, p);
  const drEnd = Math.min(taw, Math.max(0, dr0 + ks * etc - i.forecastRainMm));

  const steps: Step[] = [
    { label: 'Bitkinin bugünkü su ihtiyacı', formula: 'ETc = Kc × ET0', value: etc, unit: 'mm' },
    { label: 'Kökün tutabildiği su', formula: 'TAW = 1000 (θFC − θWP) Zr', value: taw, unit: 'mm' },
    {
      label: 'Düzeltilmiş tükenme oranı',
      formula: 'p = p_tablo + 0,04 (5 − ETc)',
      value: p,
      unit: '',
    },
    { label: 'Sıkıntısız alınabilir su', formula: 'RAW = p × TAW', value: raw, unit: 'mm' },
    { label: 'Bugün başı eksik su', formula: 'Dr (dünden)', value: dr0, unit: 'mm' },
    {
      label: 'Gün sonu beklenen eksik su',
      formula: 'Dr + Ks·ETc − yağış',
      value: drEnd,
      unit: 'mm',
    },
  ];

  if (dr0 < raw && drEnd < raw) {
    return {
      kind: 'skip',
      netDepthMm: 0,
      stressToday: false,
      reason: 'Eksik su, bitkinin rahat alabileceği sınırın altında kalıyor.',
      steps,
    };
  }
  const already = dr0 >= raw;
  return {
    kind: 'irrigate',
    netDepthMm: already ? dr0 : drEnd,
    stressToday: dr0 > raw,
    reason: already
      ? 'Eksik su rahat alınabilir sınıra ulaşmış; bitki su sıkıntısına girmeye başlıyor.'
      : 'Bugünkü kayıptan sonra eksik su rahat alınabilir sınırı aşacak.',
    steps,
  };
}
