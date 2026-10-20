/**
 * Ürün uygunluğu: faktör başına yamuk (trapez) üyelik fonksiyonu, faktörler arası ağırlıklı geometrik
 * ortalama (Liebig: en zayıf halka skoru çeker; bir faktör 0 ise ürün uygun değildir).
 * Ekonomik katman tek sayı değil aralıktır. Saf fonksiyonlar; ağ ve veritabanı yok.
 *
 * Kural 1: faktör aralığı uzman onaylı değilse skor ÜRETİLMEZ (yalnız taslak rozeti ve eksik listesi).
 */
import { quantile } from './market';
import { canDriveAdvice, type ReviewStatus } from './review';

/**
 * Yamuk üyelik: x<=a veya x>=d ise 0; [b,c] arasında 1; a..b ve c..d arasında doğrusal.
 * a<=b<=c<=d zorunlu. a==b (dik sol kenar) ve c==d (dik sağ kenar) kabul edilir: o noktada üyelik 1.
 */
export function trapezoid(x: number, a: number, b: number, c: number, d: number): number {
  if (![x, a, b, c, d].every(Number.isFinite)) throw new Error('trapez: sayı olmalı');
  if (!(a <= b && b <= c && c <= d)) throw new Error('trapez: a<=b<=c<=d olmalı');
  if (x >= b && x <= c) return 1;
  if (x <= a || x >= d) return 0;
  return x < b ? (x - a) / (b - a) : (d - x) / (d - c);
}

/** Ağırlıklı geometrik ortalama: exp(Σ w·ln(m) / Σ w). Herhangi bir m=0 ise 0. m 0..1, w>0. */
export function weightedGeometricMean(items: readonly { value: number; weight: number }[]): number {
  if (items.length === 0) throw new Error('boş küme');
  let sw = 0;
  let s = 0;
  for (const { value, weight } of items) {
    if (!(weight > 0) || !Number.isFinite(weight)) throw new Error('ağırlık pozitif olmalı');
    if (!(value >= 0 && value <= 1)) throw new Error('üyelik 0..1 olmalı');
    if (value === 0) return 0;
    sw += weight;
    s += weight * Math.log(value);
  }
  return Math.exp(s / sw);
}

export interface SuitabilityFactor {
  /** Kısa anahtar: "ph", "yillik-yagis" ... */
  key: string;
  /** Çiftçi dilinde ad. */
  label: string;
  unit: string;
  /** Yamuk köşeleri: a<=b<=c<=d. [b,c] ideal aralık. */
  trapezoid: readonly [number, number, number, number];
  weight: number;
  reviewStatus: ReviewStatus;
  /** Kaynak künyesi (kural 6). */
  source: string;
  sourceVersion: string;
  sourceDate: string;
}

export type SuitabilityClass = 'cok-uygun' | 'uygun' | 'sinirda' | 'uygun-degil';

export interface FactorScore {
  key: string;
  label: string;
  unit: string;
  value: number;
  membership: number;
  weight: number;
  /** Skoru ne kadar aşağı çektiğinin payı: w·(-ln m) / Σ (toplamı 1; hepsi 1 üyelikteyse 0). */
  shareOfLoss: number;
}

export type SuitabilityResult =
  | {
      kind: 'score';
      score: number;
      cls: SuitabilityClass;
      factors: FactorScore[];
      /** En düşük üyelikli faktör (sınırlayıcı). */
      limiting: FactorScore;
      /** Değeri verilmediği için hesaba girmeyen faktörler (uydurulmaz). */
      missing: string[];
    }
  | {
      kind: 'none';
      reason: 'onaysiz-faktor' | 'yetersiz-veri';
      badge: boolean;
      /** Onaysız (taslak) faktör anahtarları ya da yetersiz veri için eksikler. */
      keys: string[];
    };

/** Skor sınıfı: ≥0,75 çok uygun; ≥0,5 uygun; ≥0,25 sınırda; altı uygun değil. */
export function classify(score: number): SuitabilityClass {
  if (score >= 0.75) return 'cok-uygun';
  if (score >= 0.5) return 'uygun';
  if (score >= 0.25) return 'sinirda';
  return 'uygun-degil';
}

/** En az bu kadar faktörün değeri bilinmeden skor verilmez (tek faktörle "uygun" demek yanıltır). */
export const MIN_FACTORS = 2;

/**
 * Uygunluk skoru. `values` yalnız bilinen ölçümleri içerir; olmayan faktör atlanır ve `missing`e yazılır.
 * Değeri olan faktörlerden biri bile uzman onaylı değilse hiç skor üretilmez (kural 1).
 */
export function assessSuitability(
  factors: readonly SuitabilityFactor[],
  values: Readonly<Record<string, number | null | undefined>>,
): SuitabilityResult {
  const known = factors.filter((f) => {
    const v = values[f.key];
    return typeof v === 'number' && Number.isFinite(v);
  });
  const missing = factors.filter((f) => !known.includes(f)).map((f) => f.key);
  const drafts = known.filter((f) => !canDriveAdvice(f.reviewStatus)).map((f) => f.key);
  if (drafts.length > 0) {
    return { kind: 'none', reason: 'onaysiz-faktor', badge: true, keys: drafts };
  }
  if (known.length < MIN_FACTORS) {
    return { kind: 'none', reason: 'yetersiz-veri', badge: false, keys: missing };
  }

  const ms = known.map((f) => ({
    f,
    value: values[f.key] as number,
    m: trapezoid(values[f.key] as number, ...f.trapezoid),
  }));
  const score = weightedGeometricMean(ms.map((x) => ({ value: x.m, weight: x.f.weight })));
  // m=0 ise kayıp sınırsızdır: payı sıfır üyelikli faktörler eşit paylaşır.
  const zero = ms.filter((x) => x.m === 0);
  const loss = ms.map((x) =>
    zero.length > 0 ? (x.m === 0 ? 1 / zero.length : 0) : x.f.weight * Math.abs(Math.log(x.m)),
  );
  const totalLoss = loss.reduce((a, b) => a + b, 0);
  const scored: FactorScore[] = ms.map((x, i) => ({
    key: x.f.key,
    label: x.f.label,
    unit: x.f.unit,
    value: x.value,
    membership: x.m,
    weight: x.f.weight,
    shareOfLoss: totalLoss > 0 ? loss[i]! / totalLoss : 0,
  }));
  const limiting = scored.reduce((a, b) => (b.membership < a.membership ? b : a));
  return { kind: 'score', score, cls: classify(score), factors: scored, limiting, missing };
}

// --- Ekonomik katman (aralıklı) ---------------------------------------------------------------

export interface EconomicInput {
  /** Dekar başına verim aralığı, kg/da (onaylı kaynaktan). */
  yieldKgPerDa: { low: number; high: number };
  /** Günlük orta fiyat örnekleri, TL/kg (kaynaklı). */
  prices: readonly number[];
  /** Dekar başına üretim maliyeti aralığı, TL/da (kullanıcı ya da onaylı kaynak). */
  costTlPerDa: { low: number; high: number };
}

export interface EconomicRange {
  /** Dekar başına net kazanç aralığı (TL/da). */
  low: number;
  high: number;
  /** Aralığın nasıl kurulduğu: fiyat P10-P90, verim ve maliyet uçları. */
  basis: string;
  /** Aralık fiyat, verim ve maliyet belirsizliğidir; olasılıksal öngörü aralığı DEĞİLDİR. */
  isPredictionInterval: false;
}

export const MIN_PRICE_SAMPLES = 8;

/**
 * Net kazanç aralığı (TL/da): en kötü = P10 fiyat·düşük verim − yüksek maliyet;
 * en iyi = P90 fiyat·yüksek verim − düşük maliyet. Köşe birleşimi bilerek geniştir (korunaklı):
 * bağımsızlık varsayımı yapılmaz. Veri yetersizse null (uydurma yok).
 */
export function economicRange(input: EconomicInput): EconomicRange | null {
  const { yieldKgPerDa: y, costTlPerDa: c } = input;
  const prices = input.prices.filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < MIN_PRICE_SAMPLES) return null;
  if (!(y.low > 0 && y.high >= y.low) || !(c.low >= 0 && c.high >= c.low)) return null;
  const p10 = quantile(prices, 0.1);
  const p90 = quantile(prices, 0.9);
  return {
    low: p10 * y.low - c.high,
    high: p90 * y.high - c.low,
    basis: `fiyat P10-P90 (${p10.toFixed(2)}-${p90.toFixed(2)} TL/kg), verim ${y.low}-${y.high} kg/da, maliyet ${c.low}-${c.high} TL/da`,
    isPredictionInterval: false,
  };
}

export interface CropRanking {
  cropId: string;
  suitability: SuitabilityResult;
  economic: EconomicRange | null;
}

/**
 * Sıralama: yalnız skoru olanlar, skora göre azalan. Ekonomik aralık sıralamayı BELİRLEMEZ
 * (aralık kesinlik taşımaz); yalnız yanında gösterilir. Eşit skorda ürün kimliği (belirlenimli).
 */
export function rankCrops(items: readonly CropRanking[]): CropRanking[] {
  const score = (r: CropRanking) => (r.suitability.kind === 'score' ? r.suitability.score : -1);
  return items
    .filter((i) => i.suitability.kind === 'score')
    .sort((a, b) => score(b) - score(a) || a.cropId.localeCompare(b.cropId));
}
