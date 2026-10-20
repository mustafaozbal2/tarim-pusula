/**
 * Devlet destekleri eşleştirme. Destek kaydı kaynaklıdır; tutar/koşul yalnız onaylıysa "öneri" olur.
 * Taslak kayıt rozetle LİSTELENİR ama "başvurabilirsiniz" gibi bir sonuç üretmez (kural 1).
 */
import { canDriveAdvice, needsDraftBadge, type ReviewStatus } from './review';

export interface SupportRecord {
  id: string;
  title: string;
  /** Kısa, çiftçi dilinde açıklama. */
  summary: string;
  /** Boşsa tüm ürünler. */
  cropIds: readonly string[];
  /** Boşsa tüm iller. */
  provinces: readonly string[];
  /** Tarla alanı sınırları (dekar), yoksa sınırsız. */
  minAreaDecare?: number | null | undefined;
  maxAreaDecare?: number | null | undefined;
  /** Başvuru dönemi YYYY-MM-DD, yoksa bilinmiyor. */
  applyFrom?: string | null | undefined;
  applyTo?: string | null | undefined;
  reviewStatus: ReviewStatus;
  source: string;
  sourceUrl?: string | null | undefined;
  sourceDate: string;
  sourceVersion: string;
}

export interface SupportQuery {
  cropId?: string | null | undefined;
  province?: string | null | undefined;
  areaDecare?: number | null | undefined;
  /** YYYY-MM-DD, bugün. */
  today: string;
}

export interface SupportMatch {
  support: SupportRecord;
  /** Eşleşme nedenleri ("Neden?" için). */
  why: string[];
  /** Taslak ise rozet gösterilir; durum "onay-bekliyor" olur, öneri üretilmez. */
  badge: boolean;
  status: 'acik' | 'kapali' | 'donem-bilinmiyor' | 'onay-bekliyor';
}

const hasSource = (s: SupportRecord) =>
  !!s.source?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.sourceDate ?? '') && !!s.sourceVersion?.trim();

const norm = (s: string) => s.toLocaleLowerCase('tr').trim();

/**
 * Eşleştirir. Kaynaksız kayıt hiç döndürülmez. Kayıt ürün/il/alan kısıtı taşıyorsa ve girdi
 * bilinmiyorsa eşleşme belirsizdir: elenir (tahmin yok).
 */
export function matchSupports(records: readonly SupportRecord[], q: SupportQuery): SupportMatch[] {
  const out: SupportMatch[] = [];
  for (const s of records) {
    if (!hasSource(s)) continue;
    const why: string[] = [];
    if (s.cropIds.length > 0) {
      if (!q.cropId || !s.cropIds.includes(q.cropId)) continue;
      why.push('ürününüz kapsamda');
    }
    if (s.provinces.length > 0) {
      if (!q.province || !s.provinces.map(norm).includes(norm(q.province))) continue;
      why.push('ilinizde geçerli');
    }
    if (s.minAreaDecare != null) {
      if (q.areaDecare == null || q.areaDecare < s.minAreaDecare) continue;
      why.push(`tarlanız en az ${s.minAreaDecare} dekar`);
    }
    if (s.maxAreaDecare != null) {
      if (q.areaDecare == null || q.areaDecare > s.maxAreaDecare) continue;
      why.push(`tarlanız en çok ${s.maxAreaDecare} dekar`);
    }
    let status: SupportMatch['status'];
    if (needsDraftBadge(s.reviewStatus)) status = 'onay-bekliyor';
    else if (!s.applyFrom || !s.applyTo) status = 'donem-bilinmiyor';
    else status = q.today >= s.applyFrom && q.today <= s.applyTo ? 'acik' : 'kapali';
    if (canDriveAdvice(s.reviewStatus) && status === 'acik') why.push('başvuru dönemi açık');
    out.push({ support: s, why, badge: needsDraftBadge(s.reviewStatus), status });
  }
  const rank = { acik: 0, 'donem-bilinmiyor': 1, kapali: 2, 'onay-bekliyor': 3 } as const;
  return out.sort(
    (a, b) => rank[a.status] - rank[b.status] || a.support.id.localeCompare(b.support.id),
  );
}
