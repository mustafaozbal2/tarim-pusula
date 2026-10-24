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
  /** Boş = Tümü (ilçedeki tüm köyler). */
  village: string;
  /** Boş = Tümü (tüm ürünler). */
  cropIds: string[];
  /** png/jpeg/webp veri adresi ya da null (görselsiz). */
  imageDataUrl: string | null;
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
  if (f.village && !f.district) return { ok: false, error: 'Köy için önce ilçe seçin' };
  if (!f.publishDate) return { ok: false, error: 'Yayın tarihini seçin' };
  const r = announcementCreateSchema.safeParse({
    sourceOrg: f.sourceOrg,
    title: f.title,
    body: f.body,
    ...(f.sourceUrl.trim() ? { sourceUrl: f.sourceUrl.trim() } : {}),
    imageDataUrl: f.imageDataUrl,
    publishedAt: trMidnightIso(f.publishDate),
    ...(f.expireDate ? { expiresAt: trMidnightIso(f.expireDate) } : {}),
    targeting: {
      places: f.province
        ? [
            {
              province: f.province,
              ...(f.district ? { district: f.district } : {}),
              ...(f.village ? { village: f.village } : {}),
            },
          ]
        : [],
      circle: null,
      cropIds: f.cropIds,
    },
  });
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
  return { ok: true, value: r.data };
}

/** Hedefin düz Türkçe özeti (yayından önce gösterilir). Seçilmeyen alan "Tümü" demektir. */
export function describeTarget(
  f: Pick<AnnouncementForm, 'province' | 'district' | 'cropIds'> & { village?: string },
  cropNames: string[],
): string {
  const place = f.province
    ? [f.province, f.district, f.village].filter(Boolean).join(' / ')
    : 'Tüm Türkiye';
  return cropNames.length ? `${place} · ${cropNames.join(', ')}` : `${place} · tüm ürünler`;
}

interface ManagedLike {
  sourceOrg: string;
  title: string;
  body: string;
  sourceUrl?: string | null;
  publishedAt: string;
  expiresAt?: string | null;
  targeting: {
    places: { province: string; district?: string; village?: string }[];
    cropIds: string[];
  };
  imageDataUrl?: string | null;
}

/** Türkiye gününe (YYYY-MM-DD) çevirir (UTC+3, sabit). */
export const trDate = (iso: string): string =>
  new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10);

/** Kayıtlı duyuru → düzenleme formu. Birden çok yerli hedefin ilki gösterilir (panel tek yer seçer). */
export function formFromManaged(a: ManagedLike): AnnouncementForm {
  const p = a.targeting.places[0];
  return {
    sourceOrg: a.sourceOrg,
    title: a.title,
    body: a.body,
    sourceUrl: a.sourceUrl ?? '',
    publishDate: trDate(a.publishedAt),
    expireDate: a.expiresAt ? trDate(a.expiresAt) : '',
    province: p?.province ?? '',
    district: p?.district ?? '',
    village: p?.village ?? '',
    cropIds: a.targeting.cropIds,
    imageDataUrl: a.imageDataUrl ?? null,
  };
}

/** Liste sütunu için kısa hedef yazısı. */
export function targetLabel(
  t: ManagedLike['targeting'],
  cropNames: Record<string, string>,
): string {
  const place = t.places.length
    ? t.places
        .map((p) => [p.province, p.district, p.village].filter(Boolean).join(' / '))
        .join('; ')
    : 'Tüm Türkiye';
  const crops = t.cropIds.length
    ? t.cropIds.map((c) => cropNames[c] ?? c).join(', ')
    : 'tüm ürünler';
  return `${place} · ${crops}`;
}

/** Görsel sınırı: veri adresi en çok 280 000 karakter (sunucu sınırı 300 000). */
export const IMAGE_MAX_CHARS = 280_000;
export const imageFits = (dataUrl: string): boolean => dataUrl.length <= IMAGE_MAX_CHARS;
