import { announcementCreateSchema, type AnnouncementCreate } from '@tarim/schemas';

export interface AnnouncementForm {
  sourceOrg: string;
  title: string;
  body: string;
  sourceUrl: string;
  /** `YYYY-MM-DD` (Türkiye günü) */
  publishDate: string;
  expireDate: string;
  province: string;
  district: string;
  cropIds: string[];
}

export type BuildResult = { ok: true; value: AnnouncementCreate } | { ok: false; error: string };

/** Türkiye saati 00:00 (UTC+3, sabit; sunucu tarafıyla aynı kabul) → UTC ISO. */
export const trMidnightIso = (date: string): string =>
  new Date(`${date}T00:00:00+03:00`).toISOString();

/**
 * Form → sunucu gövdesi. İl seçilmezse duyuru ulusaldır; ilçe için il gerekir.
 * Doğrulama sunucudaki şemayla aynıdır (aynı paket), böylece iki taraf ayrışmaz.
 */
export function buildAnnouncement(f: AnnouncementForm): BuildResult {
  if (f.district && !f.province) return { ok: false, error: 'İlçe için önce il seçin' };
  if (!f.publishDate) return { ok: false, error: 'Yayın tarihini seçin' };
  const r = announcementCreateSchema.safeParse({
    sourceOrg: f.sourceOrg,
    title: f.title,
    body: f.body,
    ...(f.sourceUrl.trim() ? { sourceUrl: f.sourceUrl.trim() } : {}),
    publishedAt: trMidnightIso(f.publishDate),
    ...(f.expireDate ? { expiresAt: trMidnightIso(f.expireDate) } : {}),
    targeting: {
      places: f.province
        ? [{ province: f.province, ...(f.district ? { district: f.district } : {}) }]
        : [],
      circle: null,
      cropIds: f.cropIds,
    },
  });
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
  return { ok: true, value: r.data };
}

/** Hedefin düz Türkçe özeti (yayından önce gösterilir). */
export function describeTarget(
  f: Pick<AnnouncementForm, 'province' | 'district' | 'cropIds'>,
  cropNames: string[],
): string {
  const place = f.province
    ? f.district
      ? `${f.province} / ${f.district}`
      : f.province
    : 'Tüm Türkiye';
  return cropNames.length ? `${place} · ${cropNames.join(', ')}` : `${place} · tüm ürünler`;
}
