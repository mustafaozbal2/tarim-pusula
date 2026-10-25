import type { Api, CalendarDto, FieldDto } from '../api/client';
import type { KV } from '../offline/kv';
import { FIELDS_CACHE, SELECTED } from '../today/load';

export interface CalendarResult {
  field: FieldDto;
  fields: FieldDto[];
  data: CalendarDto;
  at: string;
  offline: boolean;
}

const key = (id: string) => `cache.calendar.v1.${id}`;
/** Ay görünümü gelecek aylara bakabilsin diye bir yıl (sunucu üst sınırı 366). */
export const CALENDAR_DAYS = 366;

/**
 * Seçili tarlanın takvimi (Bugün ile aynı tarla seçimi). Sunucuya ulaşılamazsa son takvim
 * önbellekten, "son güncelleme" saatiyle. Tarla yoksa null; hiç önbellek yoksa hata fırlatır.
 */
export async function loadCalendar(
  api: Pick<Api, 'fields' | 'calendar'>,
  kv: KV,
  pick?: string,
): Promise<CalendarResult | null> {
  let fields: FieldDto[];
  try {
    fields = await api.fields();
    await kv.set(FIELDS_CACHE, JSON.stringify({ at: new Date().toISOString(), fields }));
  } catch {
    const raw = await kv.get(FIELDS_CACHE);
    fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
  }
  if (fields.length === 0) return null;
  const chosenId = pick ?? (await kv.get(SELECTED));
  const field = fields.find((f) => f.id === chosenId) ?? fields[0]!;
  await kv.set(SELECTED, field.id);
  try {
    const data = await api.calendar(field.id, CALENDAR_DAYS);
    const at = new Date().toISOString();
    await kv.set(key(field.id), JSON.stringify({ at, data }));
    return { field, fields, data, at, offline: false };
  } catch {
    const raw = await kv.get(key(field.id));
    if (!raw) throw new Error('Takvim alınamadı');
    const c = JSON.parse(raw) as { at: string; data: CalendarDto };
    return { field, fields, data: c.data, at: c.at, offline: true };
  }
}
