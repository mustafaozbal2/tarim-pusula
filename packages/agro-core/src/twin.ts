import { cropEvapotranspiration } from './kc';
import { canDriveAdvice, needsDraftBadge, type ReviewStatus } from './review';
import {
  adjustDepletionFraction,
  dailyBalance,
  readilyAvailableWater,
  totalAvailableWater,
} from './waterBalance';

/**
 * İkiz Tarım (dijital ikiz) hesap çekirdeği. Saf fonksiyonlar; ağ ve veritabanı yok.
 *
 * 1. Durum motoru: FAO-56 kök bölgesi su dengesi (Allen vd. 1998, Denk. 85) her gün yürütülür;
 *    çiftçinin sulama kayıtları ve ölçülen yağış dengeye girer.
 * 2. Gözlemle düzeltme: toprak nem sensörü varsa Dr, tek boyutlu Kalman süzgeciyle (Kalman 1960)
 *    ölçüme çekilir: K = P / (P + R). Ölçüm yoksa model belirsizliği (P) her gün büyür.
 * 3. Tahmin: hava topluluğunun (ensemble) her üyesi için denge ileri yürütülür; sonuç
 *    yüzdeliklerle (p10, p50, p90) verilir. Üyeler arası fark, tahmin belirsizliğidir.
 * 4. Senaryo: aynı başlangıçtan farklı sulama planları ("ya şunu yaparsam?").
 * 5. Verim etkisi: FAO-33 Ky (Doorenbos ve Kassam 1979) 1 − Ya/Yx = Ky (1 − ETa/ETx);
 *    zeytinde FAO-66 zeytin bölümündeki parabolik ilişki (Goldhamer vd. 1994 Tablo 2 noktaları).
 * Değişmez kural 1: Kc, toprak ya da su parametresi onaysızsa sonuç "bilgi"dir, "öneri" değil.
 */

export interface TwinDay {
  /** YYYY-MM-DD */
  date: string;
  /** Referans ET0 (mm/gün). */
  et0: number;
  /** Yağış (mm). */
  rainMm: number;
}

export interface TwinMember {
  et0: number;
  rainMm: number;
}

export interface TwinForecastDay extends TwinDay {
  /** Hava topluluğu üyeleri (aynı gün). Boşsa yalnız kontrol tahmini kullanılır. */
  members: TwinMember[];
}

export interface TwinEvent {
  date: string;
  kind: 'sulama' | 'yagis';
  mm: number;
  source: string;
}

export interface TwinObservation {
  date: string;
  /** Hacimsel toprak nemi (m³/m³). */
  thetaV: number;
  /** Sensör belirsizliği (m³/m³); verilmezse DEFAULT_SIGMA_THETA. */
  sigmaTheta?: number;
  source: string;
}

export interface TwinParams {
  kc: number;
  thetaFc: number;
  thetaWp: number;
  rootDepthM: number;
  pTable: number;
}

export interface TwinGates {
  kc: ReviewStatus;
  soil: ReviewStatus;
  waterParams: ReviewStatus;
}

/** Yaygın kapasitif nem sensörü belirsizliği (±0,03 m³/m³); üretici künyesi yoksa varsayım. */
export const DEFAULT_SIGMA_THETA = 0.03;
/** Günlük süreç gürültüsü katsayıları (bizim seçimimiz; literatür sabiti değil). */
export const PROCESS_NOISE = { etc: 0.2, rain: 0.3, irrigation: 0.1 } as const;

export interface TwinStateDay {
  date: string;
  drStart: number;
  drEnd: number;
  taw: number;
  raw: number;
  p: number;
  ks: number;
  etc: number;
  etcAdj: number;
  rainMm: number;
  irrigationMm: number;
  deepPercolationMm: number;
  /** Gün sonu belirsizlik (standart sapma, mm). */
  sigmaMm: number;
  /** Sensör ölçümüyle düzeltildiyse ayrıntı. */
  corrected: { drObs: number; gain: number; source: string } | null;
  /** Gün başında Dr > RAW (bitki su sıkıntısında). */
  stress: boolean;
}

export interface TwinState {
  days: TwinStateDay[];
  end: { date: string; dr: number; sigmaMm: number; taw: number; raw: number };
  assumptions: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ölçülen nemden eksik su: Dr = 1000 (θFC − θ) Zr, 0..TAW. */
export function drFromTheta(thetaV: number, params: TwinParams, taw: number): number {
  return clamp(1000 * (params.thetaFc - thetaV) * params.rootDepthM, 0, taw);
}

/** Tek boyutlu Kalman güncellemesi: K = P/(P+R); x += K (z − x); P = (1 − K) P. */
export function kalmanUpdate(
  x: number,
  p: number,
  z: number,
  r: number,
): { x: number; p: number; gain: number } {
  if (!(p >= 0) || !(r >= 0)) throw new RangeError('P ve R negatif olamaz');
  const gain = p + r === 0 ? 0 : p / (p + r);
  return { x: x + gain * (z - x), p: (1 - gain) * p, gain };
}

/**
 * Geçmiş günler için durum motoru. Başlangıçta Dr bilinmiyorsa tarla kapasitesi (0) varsayılır ve
 * belirsizlik TAW/3 alınır; büyük yağış ya da sensör ölçümü bu belirsizliği düşürür.
 */
export function runTwinState(
  days: readonly TwinDay[],
  params: TwinParams,
  events: readonly TwinEvent[] = [],
  observations: readonly TwinObservation[] = [],
  opts: { startDr?: number; startSigmaMm?: number } = {},
): TwinState {
  const taw = totalAvailableWater(params.thetaFc, params.thetaWp, params.rootDepthM);
  const assumptions: string[] = [];
  let dr = opts.startDr === undefined ? 0 : clamp(opts.startDr, 0, taw);
  if (opts.startDr === undefined)
    assumptions.push('Pencere başında kök bölgesi tarla kapasitesinde (Dr = 0) varsayıldı.');
  let pVar = (opts.startSigmaMm ?? taw / 3) ** 2;
  const irrByDate = new Map<string, number>();
  const rainByDate = new Map<string, number>();
  for (const e of events) {
    const m = e.kind === 'sulama' ? irrByDate : rainByDate;
    m.set(e.date, (m.get(e.date) ?? 0) + Math.max(0, e.mm));
  }
  const obsByDate = new Map<string, TwinObservation>();
  for (const o of observations) obsByDate.set(o.date, o);
  if (observations.length === 0)
    assumptions.push('Toprak nem sensörü yok: durum yalnız hava ve kayıtlardan hesaplandı.');

  const out: TwinStateDay[] = [];
  let lastRaw = 0;
  for (const d of days) {
    const etc = cropEvapotranspiration(params.kc, d.et0);
    const p = adjustDepletionFraction(params.pTable, etc);
    const raw = readilyAvailableWater(taw, p);
    lastRaw = raw;
    // Ölçülen yağış kaydı varsa tahmin yağışının yerine geçer (yerel ölçüm daha güvenilirdir).
    const rain = rainByDate.get(d.date) ?? d.rainMm;
    const irr = irrByDate.get(d.date) ?? 0;
    const r = dailyBalance(dr, taw, p, {
      et0: d.et0,
      kc: params.kc,
      effectiveRainMm: rain,
      irrigationMm: irr,
    });
    pVar +=
      (PROCESS_NOISE.etc * r.etcAdj) ** 2 +
      (PROCESS_NOISE.rain * rain) ** 2 +
      (PROCESS_NOISE.irrigation * irr) ** 2;
    let drEnd = r.drEnd;
    let corrected: TwinStateDay['corrected'] = null;
    const obs = obsByDate.get(d.date);
    if (obs) {
      const z = drFromTheta(obs.thetaV, params, taw);
      const sig = 1000 * (obs.sigmaTheta ?? DEFAULT_SIGMA_THETA) * params.rootDepthM;
      const k = kalmanUpdate(drEnd, pVar, z, sig * sig);
      drEnd = clamp(k.x, 0, taw);
      pVar = k.p;
      corrected = { drObs: z, gain: k.gain, source: obs.source };
    }
    // Kök bölgesi doluysa (büyük yağış/sulama) durum fiziksel olarak sıfırlanır: belirsizlik küçülür.
    if (drEnd === 0 && r.deepPercolation > 0) pVar = Math.min(pVar, (0.05 * taw) ** 2);
    out.push({
      date: d.date,
      drStart: r.drStart,
      drEnd,
      taw,
      raw,
      p,
      ks: r.ks,
      etc: r.etc,
      etcAdj: r.etcAdj,
      rainMm: rain,
      irrigationMm: irr,
      deepPercolationMm: r.deepPercolation,
      sigmaMm: Math.sqrt(pVar),
      corrected,
      stress: r.drStart > raw,
    });
    dr = drEnd;
  }
  const last = out[out.length - 1];
  return {
    days: out,
    end: { date: last?.date ?? '', dr, sigmaMm: Math.sqrt(pVar), taw, raw: lastRaw },
    assumptions,
  };
}

// ---------------------------------------------------------------------------------------------
// Senaryolar
// ---------------------------------------------------------------------------------------------

export type TwinPlan =
  | { kind: 'yok' }
  | { kind: 'kural' }
  | { kind: 'bekle'; days: number }
  | { kind: 'aralik'; everyDays: number; depthMm: number }
  | { kind: 'simdi'; fraction: number }
  | { kind: 'kisintili'; fraction: number };

export function planLabel(p: TwinPlan): string {
  switch (p.kind) {
    case 'yok':
      return 'Hiç sulamazsam';
    case 'kural':
      return 'Pusula kuralıyla sularsam';
    case 'bekle':
      return `${p.days} gün bekleyip sonra kuralla sularsam`;
    case 'aralik':
      return `Her ${p.everyDays} günde bir ${Math.round(p.depthMm)} mm verirsem`;
    case 'simdi':
      return p.fraction >= 1
        ? 'Bugün tarla kapasitesine kadar sularsam'
        : `Bugün %${Math.round(p.fraction * 100)} kısıntılı sularsam`;
    case 'kisintili':
      return `Kural tetiklenince %${Math.round(p.fraction * 100)} kısıntılı sularsam`;
  }
}

export interface Quantiles {
  p10: number;
  p50: number;
  p90: number;
}

/** Doğrusal ara değerli yüzdelik (Hyndman-Fan tip 7, NumPy varsayılanı). */
export function percentile(xs: readonly number[], q: number): number {
  const s = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function percentiles(xs: readonly number[]): Quantiles {
  return { p10: percentile(xs, 0.1), p50: percentile(xs, 0.5), p90: percentile(xs, 0.9) };
}

/** Standart normal dağılımın ters fonksiyonu (Acklam yaklaşımı, |hata| < 1,15e-9). */
export function normalInverse(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p 0 ile 1 arasında olmalı');
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  const tail = (q: number) =>
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  if (p < pl) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - pl) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}

export interface ScenarioDay {
  date: string;
  dr: Quantiles;
  /** Üyelerin bu gün başında stres yaşayan oranı (0..1). */
  stressFraction: number;
  /** Üyelerin ortanca sulama miktarı (mm). */
  irrigationMm: number;
}

export interface ScenarioResult {
  plan: TwinPlan;
  label: string;
  days: ScenarioDay[];
  waterMm: Quantiles;
  irrigations: number;
  stressDays: Quantiles;
  minKs: number;
  deepPercolationMm: number;
  /** Dönem toplam ETa / ETx (üyeler arası yüzdelikler). */
  etaOverEtx: Quantiles;
  members: number;
}

interface MemberRun {
  drs: number[];
  stress: boolean[];
  irr: number[];
  water: number;
  stressDays: number;
  minKs: number;
  dp: number;
  eta: number;
  etx: number;
  events: number;
}

function runMember(
  forecast: readonly TwinForecastDay[],
  member: readonly TwinMember[],
  params: TwinParams,
  taw: number,
  dr0: number,
  plan: TwinPlan,
): MemberRun {
  let dr = clamp(dr0, 0, taw);
  const r: MemberRun = {
    drs: [],
    stress: [],
    irr: [],
    water: 0,
    stressDays: 0,
    minKs: 1,
    dp: 0,
    eta: 0,
    etx: 0,
    events: 0,
  };
  forecast.forEach((_, i) => {
    const m = member[i]!;
    const etc = cropEvapotranspiration(params.kc, m.et0);
    const p = adjustDepletionFraction(params.pTable, etc);
    const raw = readilyAvailableWater(taw, p);
    // Pusula kuralı: gün başı eksik su RAW'a ulaştıysa tarla kapasitesine dönecek kadar su.
    const rule = dr >= raw ? dr : 0;
    let irr = 0;
    switch (plan.kind) {
      case 'yok':
        irr = 0;
        break;
      case 'kural':
        irr = rule;
        break;
      case 'bekle':
        irr = i < plan.days ? 0 : rule;
        break;
      case 'aralik':
        irr = i % plan.everyDays === 0 ? plan.depthMm : 0;
        break;
      case 'simdi':
        irr = i === 0 ? dr * plan.fraction : rule;
        break;
      case 'kisintili':
        irr = rule * plan.fraction;
        break;
    }
    irr = Math.max(0, irr);
    if (irr > 0) r.events++;
    const b = dailyBalance(dr, taw, p, {
      et0: m.et0,
      kc: params.kc,
      effectiveRainMm: Math.max(0, m.rainMm),
      irrigationMm: irr,
    });
    const stress = b.drStart > raw;
    r.drs.push(b.drEnd);
    r.stress.push(stress);
    r.irr.push(irr);
    r.water += irr;
    if (stress) r.stressDays++;
    r.minKs = Math.min(r.minKs, b.ks);
    r.dp += b.deepPercolation;
    r.eta += b.etcAdj;
    r.etx += b.etc;
    dr = b.drEnd;
  });
  return r;
}

/**
 * Bir planı tüm topluluk üyeleri için ileri yürütür. Başlangıç belirsizliği (sigmaMm) üyelere
 * eşit aralıklı normal yüzdeliklerle dağıtılır (katmanlı örnekleme; belirlenimli).
 */
export function runScenario(
  forecast: readonly TwinForecastDay[],
  params: TwinParams,
  start: { dr: number; sigmaMm: number },
  plan: TwinPlan,
): ScenarioResult {
  const taw = totalAvailableWater(params.thetaFc, params.thetaWp, params.rootDepthM);
  const n = Math.max(1, ...forecast.map((d) => d.members.length));
  const memberOf = (d: TwinForecastDay, k: number): TwinMember =>
    d.members.length > 0 ? d.members[k % d.members.length]! : { et0: d.et0, rainMm: d.rainMm };
  const runs: MemberRun[] = [];
  for (let k = 0; k < n; k++) {
    const z = n === 1 ? 0 : normalInverse((k + 0.5) / n);
    const dr0 = clamp(start.dr + z * start.sigmaMm, 0, taw);
    runs.push(
      runMember(
        forecast,
        forecast.map((d) => memberOf(d, k)),
        params,
        taw,
        dr0,
        plan,
      ),
    );
  }
  const days: ScenarioDay[] = forecast.map((d, i) => ({
    date: d.date,
    dr: percentiles(runs.map((r) => r.drs[i]!)),
    stressFraction: runs.filter((r) => r.stress[i]).length / runs.length,
    irrigationMm: percentile(
      runs.map((r) => r.irr[i]!),
      0.5,
    ),
  }));
  return {
    plan,
    label: planLabel(plan),
    days,
    waterMm: percentiles(runs.map((r) => r.water)),
    irrigations: Math.round(
      percentile(
        runs.map((r) => r.events),
        0.5,
      ),
    ),
    stressDays: percentiles(runs.map((r) => r.stressDays)),
    minKs: percentile(
      runs.map((r) => r.minKs),
      0.5,
    ),
    deepPercolationMm: percentile(
      runs.map((r) => r.dp),
      0.5,
    ),
    etaOverEtx: percentiles(runs.map((r) => (r.etx > 0 ? r.eta / r.etx : 1))),
    members: n,
  };
}

// ---------------------------------------------------------------------------------------------
// Verim-su ilişkisi
// ---------------------------------------------------------------------------------------------

export type YieldModel =
  | { kind: 'ky'; ky: number; basis: 'kaynak' | 'varsayim'; source: string }
  | {
      kind: 'egri';
      /** (ETa/ETx, Ya/Yx) noktaları, artan sırada; aralarında doğrusal ara değer. */
      points: [number, number][];
      source: string;
    };

const FAO33 = 'FAO Sulama ve Drenaj No. 33 (Doorenbos ve Kassam, 1979) Tablo 24, sezon toplamı Ky';
const KY_ASSUMED: YieldModel = {
  kind: 'ky',
  ky: 1,
  basis: 'varsayim',
  source:
    'Bu ürün için kaynaklı Ky yok; Ky = 1 (verim kaybı su açığıyla orantılı, FAO-33 tanımı) VARSAYIMI',
};

const ky = (k: number, satir: string): YieldModel => ({
  kind: 'ky',
  ky: k,
  basis: 'kaynak',
  source: `${FAO33}: ${satir}`,
});

/** Ürün kimliğine göre verim-su modeli. Kaynaksız ürünlerde "varsayım" etiketli Ky = 1. */
export const YIELD_MODELS: Record<string, YieldModel> = {
  zeytin: {
    kind: 'egri',
    // FAO-66 zeytin bölümü (Fereres, Orgaz vd.): parabolik ilişki; Tablo 2 (Goldhamer vd. 1994)
    // göreli ETc %75,4 → verim %100 (kayıp yok), %56,3 → %90. Düşük tüketimde "neredeyse doğrusal".
    points: [
      [0, 0],
      [0.563, 0.9],
      [0.754, 1],
      [1, 1],
    ],
    source:
      'FAO Sulama ve Drenaj No. 66 (2012), zeytin bölümü, Tablo 2 (Goldhamer vd. 1994) ve Şekil 4 (Moriana vd. 2003)',
  },
  bugday: ky(1.0, 'kışlık buğday 1,0'),
  'bugday-donan-toprak': ky(1.0, 'kışlık buğday 1,0'),
  'bugday-yazlik': ky(1.15, 'yazlık buğday 1,15'),
  pamuk: ky(0.85, 'pamuk 0,85'),
  domates: ky(1.05, 'domates 1,05'),
  'misir-tane': ky(1.25, 'mısır 1,25'),
  'misir-tatli': ky(1.25, 'mısır 1,25'),
  patates: ky(1.1, 'patates 1,1'),
  'seker-pancari': ky(0.9, 'şeker pancarı 0,7-1,1 (orta değer)'),
  aycicegi: ky(0.95, 'ayçiçeği 0,95'),
  biber: ky(1.1, 'biber 1,1'),
  sogan: ky(1.1, 'soğan 1,1'),
  'kavun-karpuz': ky(1.1, 'karpuz 1,1'),
  fasulye: ky(1.15, 'fasulye 1,15'),
  yonca: ky(1.1, 'yonca 1,1'),
  'uzum-sofralik': ky(0.85, 'üzüm 0,85'),
  'uzum-sarap': ky(0.85, 'üzüm 0,85'),
};
for (const c of [
  'narenciye-yuzde70',
  'narenciye-yuzde50',
  'narenciye-yuzde20',
  'narenciye-ortulu-yuzde70',
  'narenciye-ortulu-yuzde50',
  'narenciye-ortulu-yuzde20',
])
  YIELD_MODELS[c] = ky(0.95, 'turunçgil 0,8-1,1 (orta değer)');

export function yieldModelFor(cropId: string | null): YieldModel {
  return (cropId && YIELD_MODELS[cropId]) || KY_ASSUMED;
}

/** Göreli verim kaybı 1 − Ya/Yx (0..1), ETa/ETx oranından. */
export function yieldLossFraction(model: YieldModel, etaOverEtx: number): number {
  const x = clamp(etaOverEtx, 0, 1);
  if (model.kind === 'ky') return clamp(model.ky * (1 - x), 0, 1);
  const pts = model.points;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (x <= x1) {
      const y = x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      return clamp(1 - y, 0, 1);
    }
  }
  return 0;
}

export interface YieldLoss {
  /** Dönem su açığı sezon boyu sürerse göreli verim kaybı (0..1), yüzdeliklerle. */
  fraction: Quantiles;
  model: YieldModel;
  caveat: string;
}

export function yieldLoss(model: YieldModel, etaOverEtx: Quantiles): YieldLoss {
  // ETa/ETx yüksekken kayıp düşük: p10 oranı → p90 kayıp.
  return {
    fraction: {
      p10: yieldLossFraction(model, etaOverEtx.p90),
      p50: yieldLossFraction(model, etaOverEtx.p50),
      p90: yieldLossFraction(model, etaOverEtx.p10),
    },
    model,
    caveat:
      'Dönem içi ETa/ETx oranı sezon oranı yerine kullanıldı; tek katsayı besin ve çeşit etkisini içermez (FAO-66 uyarısı). Sayı kesin verim değil, risk aralığıdır.',
  };
}

// ---------------------------------------------------------------------------------------------
// Onay kapısı ve kip
// ---------------------------------------------------------------------------------------------

export type TwinMode = 'oneri' | 'bilgi';

/** Tüm girdiler onaylıysa "öneri" kipi; aksi halde "bilgi" (rozetli, buyruk yok). */
export function twinMode(g: TwinGates): { mode: TwinMode; badge: boolean; unapproved: string[] } {
  const list: [string, ReviewStatus][] = [
    ['Kc', g.kc],
    ['toprak', g.soil],
    ['kök derinliği ve tükenme oranı', g.waterParams],
  ];
  const unapproved = list.filter(([, s]) => !canDriveAdvice(s)).map(([n]) => n);
  return {
    mode: unapproved.length === 0 ? 'oneri' : 'bilgi',
    badge: list.some(([, s]) => needsDraftBadge(s)),
    unapproved,
  };
}

// ---------------------------------------------------------------------------------------------
// Tahmin karnesi
// ---------------------------------------------------------------------------------------------

export interface ForecastCheck {
  /** Tahminin yapıldığı gün ve hedef gün. */
  issuedOn: string;
  targetDate: string;
  predicted: Quantiles;
  actual: number;
}

export interface Scorecard {
  count: number;
  /** Ortalama mutlak hata (mm), p50'ye göre. */
  maeMm: number;
  /** Gerçekleşenin p10-p90 aralığında kaldığı oran (0..1); ideali ≈ 0,8. */
  coverage: number;
  /** Ortalama işaretli hata (mm): + model Dr'yi fazla tahmin ediyor. */
  biasMm: number;
}

export function scorecard(checks: readonly ForecastCheck[]): Scorecard {
  if (checks.length === 0) return { count: 0, maeMm: 0, coverage: 0, biasMm: 0 };
  let ae = 0;
  let inside = 0;
  let bias = 0;
  for (const c of checks) {
    const e = c.predicted.p50 - c.actual;
    ae += Math.abs(e);
    bias += e;
    if (c.actual >= c.predicted.p10 - 1e-9 && c.actual <= c.predicted.p90 + 1e-9) inside++;
  }
  return {
    count: checks.length,
    maeMm: ae / checks.length,
    coverage: inside / checks.length,
    biasMm: bias / checks.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Taslak su parametreleri (FAO-56 Tablo 22): uzman onayı yokken "bilgi" kipinde kullanılır.
// ---------------------------------------------------------------------------------------------

export interface DraftWaterParams {
  rootDepthM: number;
  pTable: number;
  source: string;
  reviewStatus: ReviewStatus;
}

const T22 = 'FAO-56 Tablo 22 (Zr aralığının orta değeri, tablo p); taslak';
const t22 = (zr: number, p: number, satir: string): DraftWaterParams => ({
  rootDepthM: zr,
  pTable: p,
  source: `${T22}: ${satir}`,
  reviewStatus: 'taslak-uzman-onayi-bekliyor',
});

export const FAO56_TABLE22_DRAFT: Record<string, DraftWaterParams> = {
  'antep-fistigi': t22(1.25, 0.4, 'Pistachios Zr 1,0-1,5 p 0,40'),
  zeytin: t22(1.45, 0.65, 'Olives Zr 1,2-1,7 p 0,65'),
  badem: t22(1.5, 0.4, 'Almonds Zr 1,0-2,0 p 0,40'),
  ceviz: t22(2.05, 0.5, 'Walnut Zr 1,7-2,4 p 0,50'),
  bugday: t22(1.65, 0.55, 'Winter wheat Zr 1,5-1,8 p 0,55'),
  'bugday-donan-toprak': t22(1.65, 0.55, 'Winter wheat Zr 1,5-1,8 p 0,55'),
  'bugday-yazlik': t22(1.25, 0.55, 'Spring wheat Zr 1,0-1,5 p 0,55'),
  arpa: t22(1.25, 0.55, 'Barley Zr 1,0-1,5 p 0,55'),
  pamuk: t22(1.35, 0.65, 'Cotton Zr 1,0-1,7 p 0,65'),
  domates: t22(1.1, 0.4, 'Tomato Zr 0,7-1,5 p 0,40'),
  'misir-tane': t22(1.35, 0.55, 'Maize, field Zr 1,0-1,7 p 0,55'),
  'misir-tatli': t22(1.0, 0.5, 'Maize, sweet Zr 0,8-1,2 p 0,50'),
  patates: t22(0.5, 0.35, 'Potato Zr 0,4-0,6 p 0,35'),
  'seker-pancari': t22(0.95, 0.55, 'Sugar beet Zr 0,7-1,2 p 0,55'),
  aycicegi: t22(1.15, 0.45, 'Sunflower Zr 0,8-1,5 p 0,45'),
  mercimek: t22(0.7, 0.5, 'Lentil Zr 0,6-0,8 p 0,50'),
  nohut: t22(0.8, 0.5, 'Chick pea Zr 0,6-1,0 p 0,50'),
  biber: t22(0.75, 0.3, 'Sweet peppers Zr 0,5-1,0 p 0,30'),
  patlican: t22(0.95, 0.45, 'Egg plant Zr 0,7-1,2 p 0,45'),
  salatalik: t22(0.95, 0.5, 'Cucumber Zr 0,7-1,2 p 0,50'),
  sogan: t22(0.45, 0.3, 'Onion Zr 0,3-0,6 p 0,30'),
  'kavun-karpuz': t22(1.15, 0.4, 'Watermelon Zr 0,8-1,5 p 0,40'),
  fasulye: t22(0.6, 0.45, 'Beans, green Zr 0,5-0,7 p 0,45'),
  yonca: t22(1.5, 0.55, 'Alfalfa Zr 1,0-2,0 p 0,55'),
  cilek: t22(0.25, 0.2, 'Strawberries Zr 0,2-0,3 p 0,20'),
  cay: t22(1.2, 0.4, 'Tea Zr 0,9-1,5 p 0,40'),
  'uzum-sofralik': t22(1.5, 0.35, 'Grapes, table Zr 1,0-2,0 p 0,35'),
  'uzum-sarap': t22(1.5, 0.45, 'Grapes, wine Zr 1,0-2,0 p 0,45'),
};
for (const c of [
  'elma-kiraz-armut',
  'elma-kiraz-armut-ortulu',
  'elma-kiraz-armut-olduren-don',
  'elma-kiraz-armut-ortulu-olduren-don',
])
  FAO56_TABLE22_DRAFT[c] = t22(1.5, 0.5, 'Apples, cherries, pears Zr 1,0-2,0 p 0,50');
for (const c of [
  'kayisi-seftali',
  'kayisi-seftali-ortulu',
  'kayisi-seftali-olduren-don',
  'kayisi-seftali-ortulu-olduren-don',
])
  FAO56_TABLE22_DRAFT[c] = t22(1.5, 0.5, 'Stone fruit Zr 1,0-2,0 p 0,50');
for (const c of ['narenciye-yuzde70', 'narenciye-ortulu-yuzde70'])
  FAO56_TABLE22_DRAFT[c] = t22(1.35, 0.5, 'Citrus 70% canopy Zr 1,2-1,5 p 0,50');
for (const c of ['narenciye-yuzde50', 'narenciye-ortulu-yuzde50'])
  FAO56_TABLE22_DRAFT[c] = t22(1.25, 0.5, 'Citrus 50% canopy Zr 1,1-1,5 p 0,50');
for (const c of ['narenciye-yuzde20', 'narenciye-ortulu-yuzde20'])
  FAO56_TABLE22_DRAFT[c] = t22(0.95, 0.5, 'Citrus 20% canopy Zr 0,8-1,1 p 0,50');

/** Derece-gün tabanı (gelişim göstergesi için). Kaynaksız ürünlerde yaygın 10 °C taban kullanılır. */
export const GDD_BASE: Record<string, { baseC: number; from: string; source: string }> = {
  zeytin: {
    baseC: 7,
    from: '02-01',
    source:
      'Belušić Vozila vd. (2026) Int. J. Climatology: zeytin GDD taban 7 °C, 1 Şubat başlangıç',
  },
};
export const GDD_DEFAULT = {
  baseC: 10,
  from: '01-01',
  source:
    'McMaster ve Wilhelm (1997) derece-gün yöntemi; 10 °C yaygın taban (ürüne özel taban uzman onayı bekler)',
};
