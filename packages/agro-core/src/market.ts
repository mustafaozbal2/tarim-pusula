/**
 * Pazar hesapları: fiyat kaydının kaynak kapısı, yüzdelik (P10-P90), trend ve net kazanç aralığı.
 * Saf fonksiyonlar; ağ ve veritabanı yok.
 */

/** Gösterilebilen her fiyatın künyesi. Biri eksikse fiyat gösterilmez (kural: atıfsız iddia yok). */
export interface PriceSource {
  /** Kaynak adı (ör. "İBB Hal Fiyatları"). */
  name: string;
  /** Verinin geçerli olduğu gün (YYYY-MM-DD). */
  date: string;
  /** Veri sürümü / alım kimliği (ör. "ibb-hal-v1@2026-10-19"). */
  version: string;
  url?: string | undefined;
}

export interface PricePoint {
  /** TL/kg. */
  price: number;
  /** YYYY-MM-DD */
  date: string;
  source: PriceSource | null | undefined;
}

/** Künyesi eksik ya da fiyatı geçersiz olanı eler. */
export function sourcedOnly<T extends { price: number; source?: PriceSource | null | undefined }>(
  points: readonly T[],
): T[] {
  return points.filter(
    (p) =>
      Number.isFinite(p.price) &&
      p.price > 0 &&
      !!p.source &&
      !!p.source.name?.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.source.date ?? '') &&
      !!p.source.version?.trim(),
  );
}

/** Doğrusal aradeğerlemeli yüzdelik (Hyndman-Fan tip 7; Excel PERCENTILE.INC ile aynı). p: 0..1. */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('boş küme');
  if (p < 0 || p > 1) throw new Error('p 0..1 olmalı');
  const s = [...values].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'unknown';

export interface Trend {
  direction: TrendDirection;
  /** Sıradan en küçük kareler doğrusuna göre 30 günlük değişim, yüzde. unknown ise null. */
  changePct30d: number | null;
  /** Kullanılan gün sayısı (farklı tarih) ve ilk/son tarih. */
  days: number;
  from: string | null;
  to: string | null;
}

const MS_DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / MS_DAY;

/** Yatay sayılacak 30 günlük değişim eşiği (yüzde). */
export const FLAT_BAND_PCT = 2;
/** Trend için en az gün sayısı ve en az kapsanan aralık (gün). */
export const TREND_MIN_DAYS = 4;
export const TREND_MIN_SPAN_DAYS = 14;

/**
 * Fiyat eğilimi: aynı güne ait fiyatların ortalaması alınır, günlere doğrusal regresyon uygulanır;
 * eğim / ortalama fiyat × 30 = 30 günlük göreli değişim. Az veride "bilinmiyor" döner (uydurma yok).
 */
export function priceTrend(points: readonly Pick<PricePoint, 'price' | 'date'>[]): Trend {
  const byDay = new Map<string, number[]>();
  for (const p of points) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    byDay.set(p.date, [...(byDay.get(p.date) ?? []), p.price]);
  }
  const days = [...byDay.entries()]
    .map(([d, v]) => ({ x: dayNum(d), d, y: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => a.x - b.x);
  const first = days[0];
  const last = days[days.length - 1];
  const unknown: Trend = {
    direction: 'unknown',
    changePct30d: null,
    days: days.length,
    from: first?.d ?? null,
    to: last?.d ?? null,
  };
  if (!first || !last || days.length < TREND_MIN_DAYS || last.x - first.x < TREND_MIN_SPAN_DAYS)
    return unknown;
  const n = days.length;
  const mx = days.reduce((a, p) => a + p.x, 0) / n;
  const my = days.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of days) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  const slope = sxy / sxx;
  const changePct30d = ((slope * 30) / my) * 100;
  const direction: TrendDirection =
    Math.abs(changePct30d) < FLAT_BAND_PCT ? 'flat' : changePct30d > 0 ? 'up' : 'down';
  return { direction, changePct30d, days: n, from: first.d, to: last.d };
}

export interface NetInputs {
  /** Satış fiyatı örnekleri, TL/kg (günlük fiyatlar; yayılım P10-P90'ı verir). */
  prices: readonly number[];
  /** Nakliye maliyeti, TL / ton / km. Bilinmiyorsa null: hesaba katılmaz ve söylenir. */
  transportTlPerTonKm: number | null;
  distanceKm: number | null;
  /** Komisyon/hal rüsumu oranı (0..1). Bilinmiyorsa null: hesaba katılmaz. */
  commissionRate: number | null;
}

export interface NetRange {
  kind: 'range' | 'insufficient';
  /** TL/kg, kesinti sonrası. */
  p10: number | null;
  p50: number | null;
  p90: number | null;
  /** Kullanılan örnek sayısı. */
  samples: number;
  /** Hesaba katılan / katılmayan kalemler (arayüz "Neden?" altında gösterir). */
  assumptions: string[];
}

/** P10-P90 için en az örnek sayısı. */
export const NET_MIN_SAMPLES = 8;

/**
 * Net kazanç aralığı (TL/kg): net = fiyat × (1 − komisyon) − nakliye/kg. Aralık, fiyat örneklerinin
 * P10 ve P90'ıdır; kesintiler sabit olduğundan sıra korunur (monoton), yani net P10 = net(fiyat P10).
 * Girdi kullanıcıdan/kaynaktan gelmiyorsa o kalem sıfır SAYILMAZ, "hesaba katılmadı" diye yazılır.
 */
export function netProfitRange(i: NetInputs): NetRange {
  const prices = i.prices.filter((p) => Number.isFinite(p) && p > 0);
  const assumptions: string[] = [];
  if (prices.length < NET_MIN_SAMPLES) {
    return {
      kind: 'insufficient',
      p10: null,
      p50: null,
      p90: null,
      samples: prices.length,
      assumptions: [`En az ${NET_MIN_SAMPLES} günlük fiyat gerekir`],
    };
  }
  const comm = i.commissionRate;
  if (comm !== null && (comm < 0 || comm >= 1)) throw new Error('komisyon 0..1 olmalı');
  let transportPerKg = 0;
  if (i.transportTlPerTonKm !== null && i.distanceKm !== null) {
    if (i.transportTlPerTonKm < 0 || i.distanceKm < 0) throw new Error('negatif maliyet');
    transportPerKg = (i.transportTlPerTonKm * i.distanceKm) / 1000;
    assumptions.push('Nakliye hesaba katıldı');
  } else assumptions.push('Nakliye hesaba katılmadı');
  if (comm !== null) assumptions.push('Komisyon hesaba katıldı');
  else assumptions.push('Komisyon hesaba katılmadı');
  const net = (p: number) => p * (1 - (comm ?? 0)) - transportPerKg;
  return {
    kind: 'range',
    p10: net(quantile(prices, 0.1)),
    p50: net(quantile(prices, 0.5)),
    p90: net(quantile(prices, 0.9)),
    samples: prices.length,
    assumptions,
  };
}
