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

/**
 * G23.16 çiftçi dili: Kc sayısını "az / orta / çok su içer" diye okutur. Eşikler: Kc < 0,6 az (çıplak
 * toprağa yakın), 0,6-0,95 orta, > 0,95 çok (FAO-56'da tam gelişmiş tarla bitkileri 1,0-1,2).
 */
export function kcLevel(kc: number | null): 'az' | 'orta' | 'çok' | null {
  if (kc === null) return null;
  if (kc < 0.6) return 'az';
  if (kc <= 0.95) return 'orta';
  return 'çok';
}

/**
 * Toprağın faydalı su tutması (mm/m) 1-5 yıldız: FAO-56 Tablo 19 aralığında kumlu ~75, tınlı ~140,
 * killi ~140-160 mm/m. Eşikler: <90, <120, <140, <160, ve üstü.
 */
export function soilStars(thetaFc: number, thetaWp: number): number {
  const taw = Math.round(1000 * (thetaFc - thetaWp));
  return taw < 90 ? 1 : taw < 120 ? 2 : taw < 140 ? 3 : taw < 160 ? 4 : 5;
}
