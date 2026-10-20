import type { Api, FieldDto, TodayDto } from '../api/client';
import type { KV } from '../offline/kv';

export interface TodayResult {
  field: FieldDto;
  today: TodayDto;
  /** Veriyi sunucudan aldığımız an. */
  at: string;
  /** Sunucuya ulaşılamadı; önbellekteki son bilgi gösteriliyor. */
  offline: boolean;
}

export const FIELDS_CACHE = 'cache.fields.v1';
const SELECTED = 'today.field';
const todayKey = (id: string) => `cache.today.v1.${id}`;

interface Cached {
  at: string;
  today: TodayDto;
}

/**
 * Bugün ekranı verisi: seçili tarlanın bilgisi sunucudan; olmazsa son önbellek ("son güncelleme" görünür).
 * Tarla listesi Tarlalarım ekranıyla aynı önbelleği paylaşır.
 */
export async function loadToday(
  api: Pick<Api, 'fields' | 'today'>,
  kv: KV,
  pick?: string,
): Promise<TodayResult | null> {
  let fields: FieldDto[];
  let offline = false;
  try {
    fields = await api.fields();
    await kv.set(FIELDS_CACHE, JSON.stringify({ at: new Date().toISOString(), fields }));
  } catch {
    offline = true;
    const raw = await kv.get(FIELDS_CACHE);
    fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
  }
  const withPlace = fields.filter((f) => f.lat !== null && f.lon !== null);
  if (withPlace.length === 0) return null;
  const chosenId = pick ?? (await kv.get(SELECTED));
  const field = withPlace.find((f) => f.id === chosenId) ?? withPlace[0]!;
  await kv.set(SELECTED, field.id);

  try {
    const today = await api.today(field.id);
    const at = new Date().toISOString();
    await kv.set(todayKey(field.id), JSON.stringify({ at, today } satisfies Cached));
    return { field, today, at, offline };
  } catch {
    const raw = await kv.get(todayKey(field.id));
    if (!raw) throw new Error('Hava bilgisi alınamadı');
    const c = JSON.parse(raw) as Cached;
    return { field, today: c.today, at: c.at, offline: true };
  }
}

/** Sıradaki tarlanın kimliği (döngüsel). */
export function nextFieldId(fields: FieldDto[], currentId: string): string {
  const ids = fields.filter((f) => f.lat !== null).map((f) => f.id);
  const i = ids.indexOf(currentId);
  return ids[(i + 1) % ids.length] ?? currentId;
}
