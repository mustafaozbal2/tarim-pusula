import type { CropDto } from '../api/client';
import type { IconName } from '../components/Icon';

/** Ürün grubu: ekranda görünen ad, ikon ve renk (çocuğun anlayacağı: resim + ad). */
export const CROP_GROUPS: Record<string, { label: string; icon: IconName; color: string }> = {
  'meyve-agaci': { label: 'Meyve ağaçları', icon: 'leaf', color: '#3E9A44' },
  sebze: { label: 'Sebzeler', icon: 'leaf', color: '#E0702F' },
  tahil: { label: 'Tahıllar', icon: 'spark', color: '#C9962B' },
  baklagil: { label: 'Baklagiller', icon: 'leaf', color: '#8A5A2B' },
  endustri: { label: 'Endüstri bitkileri', icon: 'sun', color: '#B9842A' },
  yem: { label: 'Yem bitkileri', icon: 'leaf', color: '#2F8F6B' },
};

const fold = (s: string) =>
  s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

/** Aranan ürünleri gruba göre sıralı döndürür (saf; testli). */
export function groupCrops(
  crops: Pick<CropDto, 'id' | 'nameTr' | 'group' | 'commonRank'>[],
  query: string,
): { group: string; items: Pick<CropDto, 'id' | 'nameTr'>[] }[] {
  const q = fold(query.trim());
  const hit = crops.filter((c) => !q || fold(c.nameTr).includes(q));
  const order = Object.keys(CROP_GROUPS);
  const groups = [...new Set(hit.map((c) => c.group))].sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
  );
  return groups.map((g) => ({
    group: g,
    items: hit.filter((c) => c.group === g).sort((a, b) => a.nameTr.localeCompare(b.nameTr, 'tr')),
  }));
}
