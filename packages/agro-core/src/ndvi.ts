/**
 * NDVI zaman serisi: Copernicus Statistical API yanıtının ayrıştırılması, kalite kapısı ve
 * "anormal düşüş" kuralı. Saf fonksiyonlar; ağ yok.
 *
 * NDVI = (B08 - B04) / (B08 + B04) (Rouse vd. 1974). Değer aralığı [-1, 1].
 */

export interface NdviPoint {
  /** Aralık başı (YYYY-MM-DD). */
  from: string;
  /** Aralık sonu (YYYY-MM-DD, dışlayıcı). */
  to: string;
  /** Bulutsuz piksellerin ortalaması. */
  mean: number;
  min: number;
  max: number;
  stDev: number;
  /** Bulutsuz (geçerli) piksel oranı, 0..1. */
  validFraction: number;
}

/** Geçerli piksel oranı bunun altındaysa aralık güvenilmez sayılır (bizim seçimimiz, literatür eşiği değil). */
export const MIN_VALID_FRACTION = 0.5;
/** Anormal düşüş: son değer, önceki değerlerin medyanından en az bu kadar düşükse (bizim seçimimiz). */
export const DROP_THRESHOLD = 0.15;
/** Düşüş kuralı için son değerden önce en az bu kadar güvenilir değer gerekir. */
export const DROP_BASELINE_MIN = 3;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const day = (iso: unknown): string | null =>
  typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;

/**
 * Statistical API yanıtını ({ data: [{ interval, outputs: { ndvi: { bands: { B0: { stats } } } } }] })
 * zaman sırasına dizilmiş noktalara çevirir. Bozuk girdi atılır; hiç nokta yoksa boş dizi döner.
 * Hiç geçerli pikseli olmayan (tamamı bulut/veri yok) aralık da atılır.
 * @param output evalscript çıktı kimliği
 */
export function parseStatisticalResponse(raw: unknown, output = 'ndvi'): NdviPoint[] {
  if (!isObj(raw) || !Array.isArray(raw['data'])) return [];
  const points: NdviPoint[] = [];
  for (const row of raw['data']) {
    if (!isObj(row) || !isObj(row['interval']) || !isObj(row['outputs'])) continue;
    const from = day(row['interval']['from']);
    const to = day(row['interval']['to']);
    const out = row['outputs'][output];
    if (!from || !to || !isObj(out) || !isObj(out['bands'])) continue;
    const band = Object.values(out['bands'])[0];
    const stats = isObj(band) ? band['stats'] : null;
    if (!isObj(stats)) continue;
    const { mean, min, max, stDev, sampleCount, noDataCount } = stats;
    if (!finite(mean) || !finite(min) || !finite(max) || !finite(sampleCount) || sampleCount <= 0)
      continue;
    const noData = finite(noDataCount) ? noDataCount : 0;
    const valid = sampleCount - noData;
    if (valid <= 0 || mean < -1 || mean > 1) continue;
    points.push({
      from,
      to,
      mean,
      min,
      max,
      stDev: finite(stDev) ? stDev : 0,
      validFraction: valid / sampleCount,
    });
  }
  return points.sort((a, b) => a.from.localeCompare(b.from));
}

/** Yeterince bulutsuz aralıkları bırakır. */
export function reliablePoints(points: readonly NdviPoint[]): NdviPoint[] {
  return points.filter((p) => p.validFraction >= MIN_VALID_FRACTION);
}

export type NdviTrend =
  | {
      kind: 'drop';
      /** Son güvenilir değer. */
      latest: number;
      /** Önceki değerlerin medyanı. */
      baseline: number;
      /** baseline - latest (pozitif). */
      drop: number;
      date: string;
    }
  | { kind: 'normal'; latest: number; baseline: number; date: string }
  | { kind: 'unknown'; reason: 'yetersiz-veri' };

/** Dizinin medyanı (çift sayıda ortadaki ikinin ortalaması). */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/**
 * Anormal düşüş: son güvenilir değer, ondan önceki en fazla 4 güvenilir değerin medyanından
 * DROP_THRESHOLD veya daha fazla düşükse "düşüş". Önceki değer sayısı DROP_BASELINE_MIN'den azsa
 * karar verilmez. Hasat/ekim gibi doğal düşüşleri ayırt etmez: sonuç yalnız bir ipucudur ve
 * uzman onayı olmadan uyarı/komut üretmez (arayüzde rozetli).
 */
export function assessNdviTrend(points: readonly NdviPoint[]): NdviTrend {
  const ok = reliablePoints(points);
  const last = ok[ok.length - 1];
  const before = ok.slice(-5, -1);
  if (!last || before.length < DROP_BASELINE_MIN)
    return { kind: 'unknown', reason: 'yetersiz-veri' };
  const baseline = median(before.map((p) => p.mean));
  const drop = baseline - last.mean;
  const base = { latest: last.mean, baseline, date: last.from };
  // Kayan nokta: 0,15 sınırında eşitlik kabul edilsin.
  if (drop >= DROP_THRESHOLD - 1e-9) return { kind: 'drop', ...base, drop };
  return { kind: 'normal', ...base };
}
