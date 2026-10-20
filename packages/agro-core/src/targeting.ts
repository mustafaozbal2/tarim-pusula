/**
 * Duyuru hedefleme: bir duyurunun bir tarlada görünüp görünmeyeceği.
 *
 * Kurallar (belirleyici ve test edilmiş):
 *  - Yer: `places` girdilerinden biri tarlanın il (+ilçe, +köy) bilgisiyle uyuşuyorsa ya da tarla
 *    `circle` içindeyse yer koşulu sağlanır (VEYA). Hiç yer ve daire yoksa duyuru ulusaldır.
 *  - Bir girdide ilçe/köy yoksa o düzey kısıtlanmaz; ancak köy yazılıysa ilçe de yazılmış olmalıdır.
 *  - Ürün: `cropIds` boşsa tüm ürünler; doluysa tarlanın ürünü listede olmalı (ürünü olmayan tarla görmez).
 *  - Tarlanın ili bilinmiyorsa il hedefli duyuru GÖRÜNMEZ (yanlış ilin duyurusunu göstermektense hiç göstermemek).
 */

export interface TargetPlace {
  province: string;
  district?: string;
  village?: string;
}

export interface TargetCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface Targeting {
  places?: TargetPlace[];
  circle?: TargetCircle | null;
  cropIds?: string[];
}

export interface FieldSite {
  province?: string | null;
  district?: string | null;
  village?: string | null;
  lat?: number | null;
  lon?: number | null;
  cropId?: string | null;
}

/** Türkçe harflere duyarsız karşılaştırma anahtarı. */
export function foldTr(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

const EARTH_RADIUS_KM = 6371.0088;

/** İki nokta arası büyük daire uzaklığı (haversine), km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && foldTr(a) === foldTr(b);

function placeMatches(t: TargetPlace, f: FieldSite): boolean {
  if (!same(t.province, f.province)) return false;
  if (t.district && !same(t.district, f.district)) return false;
  if (t.village) {
    if (!t.district) return false;
    if (!same(t.village, f.village)) return false;
  }
  return true;
}

export function matchesPlace(t: Targeting, f: FieldSite): boolean {
  const places = t.places ?? [];
  if (places.length === 0 && !t.circle) return true;
  if (places.some((p) => placeMatches(p, f))) return true;
  if (t.circle && typeof f.lat === 'number' && typeof f.lon === 'number') {
    return haversineKm(t.circle.lat, t.circle.lon, f.lat, f.lon) <= t.circle.radiusKm;
  }
  return false;
}

export function matchesCrop(t: Targeting, f: FieldSite): boolean {
  const crops = t.cropIds ?? [];
  if (crops.length === 0) return true;
  return !!f.cropId && crops.includes(f.cropId);
}

export function matchesField(t: Targeting, f: FieldSite): boolean {
  return matchesPlace(t, f) && matchesCrop(t, f);
}

/** Duyuru şu an yayında mı? [yayın, bitiş) aralığı; bitiş yoksa süresiz. */
export function isActive(
  a: { publishedAt: Date | string; expiresAt?: Date | string | null },
  now: Date,
): boolean {
  const t = now.getTime();
  if (new Date(a.publishedAt).getTime() > t) return false;
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= t) return false;
  return true;
}

/** Kartta "Neden?" için düz Türkçe: hangi koşul bu duyuruyu bu tarlaya getirdi. */
export function explainMatch(t: Targeting, f: FieldSite): string {
  const parts: string[] = [];
  const places = t.places ?? [];
  if (places.length === 0 && !t.circle) {
    parts.push('Bu duyuru tüm ülke için yayımlandı');
  } else {
    const hit = places.find((p) => placeMatches(p, f));
    if (hit) {
      const where = [hit.province, hit.district, hit.village].filter(Boolean).join(' / ');
      parts.push(`Tarlanız ${where} bölgesinde`);
    } else if (t.circle) {
      parts.push(`Tarlanız duyurunun kapsadığı bölgenin (${t.circle.radiusKm} km çevre) içinde`);
    }
  }
  const crops = t.cropIds ?? [];
  if (crops.length > 0 && f.cropId) parts.push('ürününüz duyurunun kapsamında');
  return parts.join(', ') + '.';
}
