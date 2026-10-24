import type { Api, KcRowDto, SoilRowDto } from '../api/client';
import type { KV } from '../offline/kv';

const num = (n: number | null) =>
  n === null
    ? '-'
    : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Sunucudan; olmazsa son önbellek (liste salt okunur olduğundan çevrimdışı da açılır). */
async function cached<T>(kv: KV, key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const fresh = await fetcher();
    await kv.set(key, JSON.stringify(fresh));
    return fresh;
  } catch (e) {
    const raw = await kv.get(key);
    if (raw) return JSON.parse(raw) as T;
    throw e;
  }
}

export const loadKc = (api: Pick<Api, 'kcTable'>, kv: KV) =>
  cached(kv, 'cache.kc.v1', () => api.kcTable());
export const loadSoils = (api: Pick<Api, 'soils'>, kv: KV) =>
  cached(kv, 'cache.soils.v1', () => api.soils());

/** Tablo satırı: onay rozeti yazıyla ("Taslak" / "Onaylı"), renk tek başına anlam taşımaz. */
export function kcRows(rows: KcRowDto[]) {
  return rows.map((r) => ({
    id: r.id,
    ad: r.nameTr,
    ilk: num(r.kcIni),
    orta: num(r.kcMid),
    son: num(r.kcEnd),
    durum: r.needsBadge ? 'Taslak' : 'Onaylı',
  }));
}

export function soilRows(rows: SoilRowDto[]) {
  return rows.map((r) => ({
    id: r.key,
    ad: r.nameTr,
    fc: num(r.thetaFc),
    wp: num(r.thetaWp),
    faydali: String(Math.round(1000 * (r.thetaFc - r.thetaWp))),
    durum: r.needsBadge ? 'Taslak' : 'Onaylı',
  }));
}
