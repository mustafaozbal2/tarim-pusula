import type { AnnouncementDto } from '../api/client';
import { tr } from '../i18n/tr';

/** "Kaynak: kurum · Yayın: gün.ay.yıl" (kural 6: her bilgi kartında kaynak + tarih). */
export function announcementSource(a: Pick<AnnouncementDto, 'sourceOrg' | 'publishedAt'>) {
  const date = new Date(a.publishedAt).toLocaleDateString('tr-TR');
  return `${tr.common.source}: ${a.sourceOrg} · ${tr.today.announcementPublished}: ${date}`;
}

/**
 * Duyuru metninin sonundaki "Kaynak: ..." satırı kartın altında zaten yazılı (announcementSource):
 * metinden çıkarılır ki aynı kaynak iki kez görünmesin. Ortadaki "Kaynak" geçen cümlelere dokunulmaz.
 */
export function announcementBody(body: string): string {
  const lines = body.replace(/\s+$/, '').split('\n');
  while (lines.length > 1 && /^\s*(kaynak|source)\s*:/i.test(lines[lines.length - 1]!)) lines.pop();
  return lines.join('\n').replace(/\s+$/, '');
}
