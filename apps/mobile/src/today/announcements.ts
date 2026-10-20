import type { Api, AnnouncementDto } from '../api/client';
import type { KV } from '../offline/kv';

const key = (fieldId: string) => `cache.announcements.v1.${fieldId}`;

/**
 * Tarlaya uyan duyurular. Sunucuya ulaşılamazsa son önbellek; hiç yoksa boş liste
 * (duyuru yokluğu Bugün ekranını engellemez).
 */
export async function loadAnnouncements(
  api: Pick<Api, 'announcements'>,
  kv: KV,
  fieldId: string,
): Promise<AnnouncementDto[]> {
  try {
    const { announcements } = await api.announcements(fieldId);
    await kv.set(key(fieldId), JSON.stringify(announcements));
    return announcements;
  } catch {
    const raw = await kv.get(key(fieldId));
    return raw ? (JSON.parse(raw) as AnnouncementDto[]) : [];
  }
}
