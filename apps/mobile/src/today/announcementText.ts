import type { AnnouncementDto } from '../api/client';
import { tr } from '../i18n/tr';

/** "Kaynak: kurum · Yayın: gün.ay.yıl" (kural 6: her bilgi kartında kaynak + tarih). */
export function announcementSource(a: Pick<AnnouncementDto, 'sourceOrg' | 'publishedAt'>) {
  const date = new Date(a.publishedAt).toLocaleDateString('tr-TR');
  return `${tr.common.source}: ${a.sourceOrg} · ${tr.today.announcementPublished}: ${date}`;
}
