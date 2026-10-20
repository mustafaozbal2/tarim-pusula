import type { Api, FieldDto, NdviDto } from '../api/client';
import type { KV } from '../offline/kv';
import { FIELDS_CACHE, SELECTED } from '../today/load';

export interface NdviResult {
  field: FieldDto;
  /** Konumlu tarlalar (tarla değiştirmek için). */
  fields: FieldDto[];
  data: NdviDto;
  /** Veriyi sunucudan aldığımız an. */
  at: string;
  /** Sunucuya ulaşılamadı; önbellekteki son bilgi gösteriliyor. */
  offline: boolean;
}

const key = (id: string) => `cache.ndvi.v1.${id}`;

/**
 * Seçili tarlanın (Bugün ekranıyla aynı seçim ve tarla önbelleği) NDVI serisi. Sunucuya
 * ulaşılamazsa son seri önbellekten, "son güncelleme" saatiyle. Tarla yoksa null; hiç önbellek
 * yoksa hata fırlatır.
 */
export async function loadNdvi(
  api: Pick<Api, 'fields' | 'ndvi'>,
  kv: KV,
  pick?: string,
): Promise<NdviResult | null> {
  let all: FieldDto[];
  try {
    all = await api.fields();
    await kv.set(FIELDS_CACHE, JSON.stringify({ at: new Date().toISOString(), fields: all }));
  } catch {
    const raw = await kv.get(FIELDS_CACHE);
    all = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
  }
  const fields = all.filter((f) => f.lat !== null && f.lon !== null);
  if (fields.length === 0) return null;
  const chosenId = pick ?? (await kv.get(SELECTED));
  const field = fields.find((f) => f.id === chosenId) ?? fields[0]!;
  await kv.set(SELECTED, field.id);
  try {
    const data = await api.ndvi(field.id);
    const at = new Date().toISOString();
    await kv.set(key(field.id), JSON.stringify({ at, data }));
    return { field, fields, data, at, offline: false };
  } catch {
    const raw = await kv.get(key(field.id));
    if (!raw) throw new Error('Yeşillik bilgisi alınamadı');
    const c = JSON.parse(raw) as { at: string; data: NdviDto };
    return { field, fields, data: c.data, at: c.at, offline: true };
  }
}
