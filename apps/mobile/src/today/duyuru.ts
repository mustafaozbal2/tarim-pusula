import type { AnnouncementDto } from '../api/client';

/**
 * Ana sayfada gösterilecek duyuru: uzman onaylılar ve resmi siteden OTOMATİK alınanlar (özgün bağlantılı).
 * Otomatik duyuru onaylı sayılmaz: kartında "otomatik alındı" notu vardır ve bildirim/uyarı üretmez (kural 1).
 */
export const gosterilir = (a: Pick<AnnouncementDto, 'needsBadge' | 'auto'>): boolean =>
  !a.needsBadge || a.auto === true;

/** Duyuru görseli: panelden yüklenen veri adresi ya da resmi sitedeki https görsel. */
export const gorselUri = (a: Pick<AnnouncementDto, 'imageDataUrl' | 'imageUrl'>): string | null =>
  a.imageDataUrl ?? a.imageUrl ?? null;

/** Yalnız https bağlantı açılır. */
export const guvenliBaglanti = (u: string | null | undefined): string | null =>
  u && /^https:\/\/[^\s]+$/.test(u) ? u : null;
