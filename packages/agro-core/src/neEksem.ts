import { canDriveAdvice, type ReviewStatus } from './review';

/**
 * "Ne Eksem?" karar destek çekirdeği. Saf fonksiyonlar; ağ ve veritabanı yok.
 *
 * Katmanlar (rapor Bölüm 3):
 *  A. Arz: uydu haritasından alan tahmini, hata matrisiyle düzeltilmiş ve güven aralıklı
 *     (Olofsson vd. 2014, Denk. 8-11); resmî istatistikle ters varyans ağırlıklı birleştirme.
 *     Ağaçlarda yaş-kohort modeli: Üretim(t) = Σ N(a,t)·v(a)·h(t).
 *  B-C. Talep ve denge: TÜİK yeterlilik derecesi Y (%) → açık oranı g = 1 − Y/100
 *     (Talep − Arz)/Talep ile aynı şeydir, çünkü Y = Arz/Talep·100.
 *  D. Süzgeçler: tarla uygunluğu (uzman onaylı), resmî üretim planı (havza ürün deseni), bahçe kısıtı.
 *  E. Sıralama: açık + plan + uygunluk + fiyat eğilimi; belirsizlik ve güven düzeyi; azalan kota.
 * Dil bilgi dilidir: "açığı en yüksek görünen ürünler". Öneri/komut yok; karar çiftçinindir.
 */

// ---------------------------------------------------------------------------------------------
// A. Alan tahmini (Olofsson vd. 2014)
// ---------------------------------------------------------------------------------------------

export interface AreaEstimate {
  /** Sınıf sırası harita sınıflarıyla aynı. */
  classIndex: number;
  /** Haritadaki alan (A·W_k). */
  mappedArea: number;
  /** Hata düzeltmeli alan Â_k = A·p̂_·k. */
  area: number;
  standardError: number;
  /** %95 güven aralığı yarı genişliği (1,96·SH). */
  marginOfError: number;
  /** Kullanıcı doğruluğu U_k = p̂_kk / p̂_k· */
  usersAccuracy: number;
  /** Üretici doğruluğu P_k = p̂_kk / p̂_·k */
  producersAccuracy: number;
}

/**
 * Tabakalı rastgele örnekleme (tabaka = harita sınıfı) ile alan tahmini.
 * W: harita sınıflarının alan payları (toplam 1). counts[i][k]: harita sınıfı i olup referansta k çıkan
 * örnek sayısı. Döner: her sınıf için düzeltilmiş alan, SH ve güven aralığı; genel doğruluk ayrıca.
 */
export function stratifiedAreaEstimate(
  W: readonly number[],
  counts: readonly (readonly number[])[],
  totalArea: number,
): { classes: AreaEstimate[]; overallAccuracy: number } {
  const q = W.length;
  if (q === 0 || counts.length !== q || counts.some((r) => r.length !== q))
    throw new RangeError('W ve hata matrisi q×q olmalı');
  const sumW = W.reduce((a, b) => a + b, 0);
  if (Math.abs(sumW - 1) > 1e-6) throw new RangeError('Alan payları toplamı 1 olmalı');
  const n = counts.map((r) => r.reduce((a, b) => a + b, 0));
  if (n.some((x) => x < 2)) throw new RangeError('Her tabakada en az 2 örnek gerekir');
  // p̂_ik = W_i · n_ik / n_i·  (Denk. 4)
  const p = counts.map((r, i) => r.map((c) => (W[i]! * c) / n[i]!));
  let overall = 0;
  for (let i = 0; i < q; i++) overall += p[i]![i]!;
  const classes: AreaEstimate[] = [];
  for (let k = 0; k < q; k++) {
    let pk = 0;
    let v = 0;
    for (let i = 0; i < q; i++) {
      pk += p[i]![k]!;
      const qik = counts[i]![k]! / n[i]!;
      v += (W[i]! ** 2 * qik * (1 - qik)) / (n[i]! - 1); // Denk. 10
    }
    const se = Math.sqrt(v);
    const pkk = p[k]![k]!;
    classes.push({
      classIndex: k,
      mappedArea: totalArea * W[k]!,
      area: totalArea * pk,
      standardError: totalArea * se,
      marginOfError: 1.96 * totalArea * se,
      usersAccuracy: W[k]! > 0 ? pkk / W[k]! : 0,
      producersAccuracy: pk > 0 ? pkk / pk : 0,
    });
  }
  return { classes, overallAccuracy: overall };
}

/** Ters varyans ağırlıklı birleştirme: x* = (a/σa² + b/σb²)/(1/σa² + 1/σb²). Belirsizliği küçük olan ağır basar. */
export function fuseEstimates(
  a: { value: number; sigma: number },
  b: { value: number; sigma: number },
): { value: number; sigma: number; weightA: number } {
  if (!(a.sigma > 0) || !(b.sigma > 0)) throw new RangeError('σ pozitif olmalı');
  const wa = 1 / a.sigma ** 2;
  const wb = 1 / b.sigma ** 2;
  return {
    value: (a.value * wa + b.value * wb) / (wa + wb),
    sigma: Math.sqrt(1 / (wa + wb)),
    weightA: wa / (wa + wb),
  };
}

// ---------------------------------------------------------------------------------------------
// A2. Ağaçlarda yaş-kohort modeli
// ---------------------------------------------------------------------------------------------

export interface TreeCohortInput {
  /** N(a,0): a yaşındaki ağaç sayısı (indeks = yaş). */
  treesByAge: readonly number[];
  /** v(a): yaşa göre ağaç başı verim (kg); dizinin sonundaki değer daha yaşlılara uygulanır. */
  yieldByAge: readonly number[];
  /** Yıllık yeni dikim sayısı (sabit varsayım) ya da yıl yıl dizi. */
  newPlanting: number | readonly number[];
  /** Yıllık söküm oranı (0..1), tüm yaşlara eşit uygulanır. */
  removalRate?: number;
  years: number;
}

/** Üretim(t) = Σ_a N(a,t)·v(a); N(a+1,t+1) = N(a,t)·(1−söküm); N(0,t) = yeni dikim(t). Birim: kg. */
export function treeCohortProjection(i: TreeCohortInput): { year: number; productionKg: number }[] {
  const rem = i.removalRate ?? 0;
  if (rem < 0 || rem >= 1) throw new RangeError('Söküm oranı 0 ile 1 arasında olmalı');
  const v = (a: number) => i.yieldByAge[Math.min(a, i.yieldByAge.length - 1)] ?? 0;
  let N = [...i.treesByAge];
  const out: { year: number; productionKg: number }[] = [];
  for (let t = 0; t <= i.years; t++) {
    out.push({ year: t, productionKg: N.reduce((s, n, a) => s + n * v(a), 0) });
    const plant = typeof i.newPlanting === 'number' ? i.newPlanting : (i.newPlanting[t] ?? 0);
    N = [plant, ...N.map((n) => n * (1 - rem))];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// B-C. Denge
// ---------------------------------------------------------------------------------------------

/** Açık oranı g = (Talep − Arz)/Talep = 1 − Y/100. Y: TÜİK yeterlilik derecesi (%). */
export function gapRatio(yeterlilikPct: number): number {
  if (!Number.isFinite(yeterlilikPct) || yeterlilikPct < 0) throw new RangeError('yeterlilik ≥ 0');
  return 1 - yeterlilikPct / 100;
}

export type GapBand = 'acik-buyuk' | 'acik' | 'dengede' | 'fazla' | 'cok-fazla';

/** Eşikler bizim seçimimizdir (literatür sabiti değil): ±%5 dengede, %5-20 açık/fazla, ötesi büyük. */
export function gapBand(g: number): GapBand {
  if (g >= 0.2) return 'acik-buyuk';
  if (g >= 0.05) return 'acik';
  if (g > -0.05) return 'dengede';
  if (g > -0.5) return 'fazla';
  return 'cok-fazla';
}

export function gapBandLabel(b: GapBand): string {
  return {
    'acik-buyuk': 'Açık büyük',
    acik: 'Açık var',
    dengede: 'Dengede',
    fazla: 'Fazla var',
    'cok-fazla': 'Çok fazla var',
  }[b];
}

/** Çubuk için 0..1: 0,5 dengede; 1 büyük açık; 0 büyük fazla. g −0,5..+0,3 aralığına kırpılır. */
export function gapBar(g: number): number {
  const lo = -0.5;
  const hi = 0.3;
  const x = Math.min(hi, Math.max(lo, g));
  return x >= 0 ? 0.5 + (x / hi) * 0.5 : 0.5 - (x / lo) * 0.5;
}

// ---------------------------------------------------------------------------------------------
// E. Sıralama
// ---------------------------------------------------------------------------------------------

export type Confidence = 'temel' | 'uydu-destekli' | 'yerinde-dogrulanmis';

export function confidenceLevel(f: { satellite: boolean; locallyVerified: boolean }): Confidence {
  if (f.locallyVerified) return 'yerinde-dogrulanmis';
  if (f.satellite) return 'uydu-destekli';
  return 'temel';
}

export interface CropCandidate {
  cropId: string;
  name: string;
  lifespan: 'yillik' | 'cok-yillik';
  /** TÜİK yeterlilik (%); yoksa null (açık hesaplanamaz). */
  yeterlilikPct: number | null;
  /** Yeterlilik verisinin dönemi ve kaynağı. */
  balanceSource: { period: string; source: string; date: string } | null;
  /** Resmî havza ürün deseninde bu ilçe için listelenmiş mi; il içinde herhangi bir ilçede mi. */
  inDistrictPlan: boolean;
  inProvincePlan: boolean;
  /** Yeni bahçe kısıtı (yeterlilik ≥ %150 kuralı). */
  restricted: { rule: string; source: string; reviewStatus: ReviewStatus } | null;
  /** Tarla uygunluğu (uzman onaylı faktörlerle); yoksa null. */
  suitability: 'cok-uygun' | 'uygun' | 'sinirda' | 'uygun-degil' | null;
  /** Son 12 ayda kaynaklı hal fiyatı eğilimi (ör. +0,12 = %12 artış); yoksa null. */
  priceTrend: number | null;
  /** Uydu düzeltmeli alan verisi var mı; yerinde etiketle doğrulanmış mı. */
  satellite?: boolean;
  locallyVerified?: boolean;
}

export interface RankedCrop {
  cropId: string;
  name: string;
  lifespan: 'yillik' | 'cok-yillik';
  gap: number | null;
  band: GapBand | null;
  bar: number;
  score: number;
  confidence: Confidence;
  inDistrictPlan: boolean;
  inProvincePlan: boolean;
  suitability: CropCandidate['suitability'];
  priceTrend: number | null;
  restricted: CropCandidate['restricted'];
  reasons: string[];
  balanceSource: CropCandidate['balanceSource'];
}

/** Ağırlıklar bizim seçimimiz; "Neden?" ekranında yazılır. */
export const RANK_WEIGHTS = {
  gap: 1.0,
  districtPlan: 0.15,
  provincePlan: 0.08,
  suitability: { 'cok-uygun': 0.12, uygun: 0.06, sinirda: -0.1, 'uygun-degil': -1 },
  priceTrend: 0.25,
  noData: -0.3,
} as const;

export function rankCandidates(cands: readonly CropCandidate[]): {
  ranked: RankedCrop[];
  restricted: RankedCrop[];
  noData: RankedCrop[];
} {
  const all = cands.map((c): RankedCrop => {
    const reasons: string[] = [];
    let score = 0;
    const gap = c.yeterlilikPct === null ? null : gapRatio(c.yeterlilikPct);
    let band: GapBand | null = null;
    if (gap === null) {
      score += RANK_WEIGHTS.noData;
      reasons.push('TÜİK yeterlilik verisi bu ürün için elimizde yok; açık hesaplanamadı.');
    } else {
      band = gapBand(gap);
      score += RANK_WEIGHTS.gap * Math.min(0.5, Math.max(-0.5, gap));
      reasons.push(
        `TÜİK yeterlilik %${c.yeterlilikPct!.toLocaleString('tr-TR')} → açık oranı ${(gap * 100).toFixed(0) === '-0' ? '0' : (gap * 100).toFixed(0)}% (${gapBandLabel(band)}).`,
      );
    }
    if (c.inDistrictPlan) {
      score += RANK_WEIGHTS.districtPlan;
      reasons.push('İlçenin resmî havza ürün deseninde yer alıyor (planlı üretim desteği).');
    } else if (c.inProvincePlan) {
      score += RANK_WEIGHTS.provincePlan;
      reasons.push('İlin başka ilçelerinde resmî ürün deseninde yer alıyor.');
    }
    if (c.suitability) {
      score += RANK_WEIGHTS.suitability[c.suitability];
      reasons.push(`Tarla uygunluğu: ${c.suitability.replace('-', ' ')} (uzman onaylı aralıklar).`);
    }
    if (c.priceTrend !== null) {
      score += RANK_WEIGHTS.priceTrend * Math.min(0.5, Math.max(-0.5, c.priceTrend));
      reasons.push(
        `Hal fiyatı son 12 ayda ${c.priceTrend >= 0 ? '+' : ''}${Math.round(c.priceTrend * 100)}%.`,
      );
    }
    if (c.restricted) reasons.push(`Yeni bahçe kurulması kısıtlı: ${c.restricted.rule}.`);
    return {
      cropId: c.cropId,
      name: c.name,
      lifespan: c.lifespan,
      gap,
      band,
      bar: gap === null ? 0.5 : gapBar(gap),
      score,
      confidence: confidenceLevel({
        satellite: !!c.satellite,
        locallyVerified: !!c.locallyVerified,
      }),
      inDistrictPlan: c.inDistrictPlan,
      inProvincePlan: c.inProvincePlan,
      suitability: c.suitability,
      priceTrend: c.priceTrend,
      restricted: c.restricted,
      reasons,
      balanceSource: c.balanceSource,
    };
  });
  const bySc = (a: RankedCrop, b: RankedCrop) =>
    b.score - a.score || a.name.localeCompare(b.name, 'tr');
  return {
    ranked: all
      .filter((r) => !r.restricted && r.gap !== null && r.suitability !== 'uygun-degil')
      .sort(bySc),
    restricted: all.filter((r) => !!r.restricted).sort(bySc),
    noData: all.filter((r) => !r.restricted && r.gap === null).sort(bySc),
  };
}

// ---------------------------------------------------------------------------------------------
// E2. Niyet beyanı ve azalan kota
// ---------------------------------------------------------------------------------------------

export interface IntentTally {
  cropId: string;
  /** Beyan edilen toplam dekar. */
  decare: number;
  count: number;
}

/**
 * Kota(c) = max(0, Talep − Arz)/Verim (dekar). Talep ton, verim kg/da. Talep bilinmiyorsa null:
 * bu durumda yalnız beyan toplamı gösterilir, "kalan" hesaplanmaz.
 */
export function quotaDecare(
  demandTon: number | null,
  yeterlilikPct: number,
  yieldKgPerDa: number,
): number | null {
  if (demandTon === null || !(yieldKgPerDa > 0)) return null;
  const gapTon = Math.max(0, demandTon * gapRatio(yeterlilikPct));
  return (gapTon * 1000) / yieldKgPerDa;
}

export function remainingQuota(
  quota: number | null,
  tally: IntentTally | undefined,
): number | null {
  if (quota === null) return null;
  return Math.max(0, quota - (tally?.decare ?? 0));
}

// ---------------------------------------------------------------------------------------------
// Doğruluk ölçüsü 3: sıralama isabeti (geçmişe dönük sınama)
// ---------------------------------------------------------------------------------------------

/**
 * Sistemin "açığı en yüksek" dediği ilk k ürünün, sonraki yıl göreli fiyatı artan (medyanın üstünde)
 * ürünler arasında olma oranı. realized: ürün → sonraki yıl göreli fiyat değişimi.
 */
export function rankingHitRate(
  predictedTop: readonly string[],
  realized: Readonly<Record<string, number>>,
): { hitRate: number; hits: string[]; misses: string[] } {
  const vals = Object.values(realized).sort((a, b) => a - b);
  if (vals.length === 0 || predictedTop.length === 0) return { hitRate: 0, hits: [], misses: [] };
  const mid =
    vals.length % 2
      ? vals[(vals.length - 1) / 2]!
      : (vals[vals.length / 2 - 1]! + vals[vals.length / 2]!) / 2;
  const hits: string[] = [];
  const misses: string[] = [];
  for (const c of predictedTop) {
    const r = realized[c];
    if (r === undefined) continue;
    (r > mid ? hits : misses).push(c);
  }
  const n = hits.length + misses.length;
  return { hitRate: n ? hits.length / n : 0, hits, misses };
}

/** Uzman onayı kapısı: uygunluk ve kısıt verisi onaysızsa sonuç "bilgi" kipinde gösterilir. */
export function neEksemMode(statuses: readonly ReviewStatus[]): 'oneri' | 'bilgi' {
  return statuses.length > 0 && statuses.every(canDriveAdvice) ? 'oneri' : 'bilgi';
}
