import type { Api, MarketDto } from '../api/client';
import type { KV } from '../offline/kv';
import { FIELDS_CACHE, SELECTED } from '../today/load';
import type { FieldDto } from '../api/client';

const cropsKey = 'cache.market.crops.v1';
const priceKey = (crop: string, field: string | undefined) =>
  `cache.market.v1.${crop}.${field ?? '-'}`;

export interface MarketResult {
  crops: { id: string; name: string }[];
  cropId: string | null;
  data: MarketDto | null;
  at: string | null;
  offline: boolean;
  /** Seçili arazinin ili: fiyat konumu GPS'e değil buna (ya da seçilen satış yerine) göre belirlenir. */
  fieldProvince: string | null;
  /** Çiftçinin seçtiği satış yeri (yoksa null). */
  chosenPlaceId: string | null;
}

export const PLACE_KEY = 'market.place.v1';

/** Satış yeri seçimini kalıcı yapar (null: arazimin ili). */
export async function chooseMarketPlace(kv: KV, placeId: string | null): Promise<void> {
  if (placeId) await kv.set(PLACE_KEY, placeId);
  else await kv.remove(PLACE_KEY);
}

/** Konumlu seçili tarla (Bugün ekranıyla aynı seçim); yoksa undefined: mesafe gösterilmez. */
async function selectedField(kv: KV): Promise<FieldDto | undefined> {
  const raw = await kv.get(FIELDS_CACHE);
  if (!raw) return undefined;
  const fields = (JSON.parse(raw) as { fields: FieldDto[] }).fields.filter((f) => f.lat !== null);
  const chosen = await kv.get(SELECTED);
  return fields.find((f) => f.id === chosen) ?? fields[0];
}

/**
 * Pazar verisi: sunucudan; olmazsa son önbellek ve "son güncelleme" saati. Fiyat listesi sunucudan
 * gelen kaynaklı veridir; istemci bir şey eklemez.
 */
export async function loadMarket(
  api: Pick<Api, 'marketCrops' | 'marketPrices'>,
  kv: KV,
  pick?: string,
): Promise<MarketResult> {
  let offline = false;
  let crops: { id: string; name: string }[];
  try {
    crops = await api.marketCrops();
    await kv.set(cropsKey, JSON.stringify(crops));
  } catch {
    offline = true;
    const raw = await kv.get(cropsKey);
    crops = raw ? (JSON.parse(raw) as typeof crops) : [];
  }
  const cropId = crops.find((c) => c.id === pick)?.id ?? crops[0]?.id ?? null;
  const field = await selectedField(kv);
  const fieldId = field?.id;
  const extra = { fieldProvince: field?.province ?? null, chosenPlaceId: await kv.get(PLACE_KEY) };
  if (!cropId) return { crops, cropId: null, data: null, at: null, offline, ...extra };
  try {
    const data = await api.marketPrices(cropId, fieldId);
    const at = new Date().toISOString();
    await kv.set(priceKey(cropId, fieldId), JSON.stringify({ at, data }));
    return { crops, cropId, data, at, offline, ...extra };
  } catch {
    const raw = await kv.get(priceKey(cropId, fieldId));
    if (!raw) throw new Error('Fiyat alınamadı');
    const c = JSON.parse(raw) as { at: string; data: MarketDto };
    return { crops, cropId, data: c.data, at: c.at, offline: true, ...extra };
  }
}
