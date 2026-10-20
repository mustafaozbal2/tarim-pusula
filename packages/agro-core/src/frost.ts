import { canDriveAdvice, needsDraftBadge, type ReviewStatus } from './review';

export interface FrostProbability {
  /** Üyelerin Tmin ≤ Tkritik olan oranı (0-1). */
  probability: number;
  members: number;
  minMemberC: number;
  medianMinC: number;
}

/**
 * Olasılıksal don riski: P(don) = #{üye : Tmin ≤ Tkritik} / #üye (PLAN §6.3).
 * Sıcaklıklar parsel yüksekliğine düzeltilmiş olmalı. Geçersiz (NaN) üyeler atılır.
 */
export function frostProbability(memberMinC: number[], criticalC: number): FrostProbability {
  const v = memberMinC.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) throw new RangeError('En az bir geçerli ensemble üyesi gerekir');
  const hits = v.filter((x) => x <= criticalC).length;
  const mid = v.length >> 1;
  return {
    probability: hits / v.length,
    members: v.length,
    minMemberC: v[0]!,
    medianMinC: v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2,
  };
}

export type FrostLevel = 'none' | 'watch' | 'warning';

/** Olasılığı kartta gösterilecek düzeye çevirir: ≥%50 uyarı, ≥%20 dikkat. */
export function frostLevel(p: number): FrostLevel {
  return p >= 0.5 ? 'warning' : p >= 0.2 ? 'watch' : 'none';
}

export type FrostAssessment =
  | ({ kind: 'frost' } & FrostProbability & { level: FrostLevel; thresholdC: number })
  | { kind: 'none'; reason: 'uzman-onayi-bekliyor' | 'deger-yok'; badge: boolean };

/** Eşik yalnız onaylıysa değerlendirme üretir (değişmez kural 1); aksi halde uyarı yok, yalnız rozet. */
export function assessFrost(
  stage: { frostCriticalC: number | null; reviewStatus: ReviewStatus } | undefined,
  memberMinC: number[],
): FrostAssessment {
  if (!stage) return { kind: 'none', reason: 'deger-yok', badge: false };
  if (!canDriveAdvice(stage.reviewStatus)) {
    return {
      kind: 'none',
      reason: 'uzman-onayi-bekliyor',
      badge: needsDraftBadge(stage.reviewStatus),
    };
  }
  if (stage.frostCriticalC === null) return { kind: 'none', reason: 'deger-yok', badge: false };
  const p = frostProbability(memberMinC, stage.frostCriticalC);
  return {
    kind: 'frost',
    ...p,
    level: frostLevel(p.probability),
    thresholdC: stage.frostCriticalC,
  };
}
