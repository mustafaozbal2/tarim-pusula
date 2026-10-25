import type { MarketNetDto, MarketPlaceDto, MarketTrendDto } from '../api/client';
import { tr } from '../i18n/tr';

const t = tr.market;
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** 285 -> "285 ₺", 22,34 -> "22,3 ₺" (100 ₺ ve üstü tam sayı). */
export function tl(n: number): string {
  const s =
    n >= 100 ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
  return `${s.replace(/,0$/, '')} ₺`;
}

/** "2026-10-19" -> "19 Ekim 2026" */
export function dayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function trendText(tr_: MarketTrendDto): string {
  switch (tr_.direction) {
    case 'up':
      return t.trendUp;
    case 'down':
      return t.trendDown;
    case 'flat':
      return t.trendFlat;
    default:
      return t.trendUnknown;
  }
}

export function distanceText(
  p: Pick<MarketPlaceDto, 'distanceKm' | 'approxLocation'>,
): string | null {
  if (p.distanceKm === null) return null;
  const km = p.distanceKm < 10 ? Math.round(p.distanceKm * 10) / 10 : Math.round(p.distanceKm);
  return `${String(km).replace('.', ',')} km uzakta${p.approxLocation ? ` (${t.approx})` : ''}`;
}

/** Net kazanç aralığı yazısı; yeterli veri yoksa null (arayüz "yeterli veri yok" der, rakam uydurmaz). */
export function netText(n: MarketNetDto): string | null {
  if (n.kind !== 'range' || n.p10 === null || n.p90 === null) return null;
  return `${tl(n.p10)} - ${tl(n.p90)}`;
}

/** Künyesi eksik bir fiyat ekranda gösterilmez (sunucu da eler; istemci ikinci kapı). */
export function hasSource(p: MarketPlaceDto): boolean {
  const s = p.source;
  return !!s && !!s.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && !!s.version.trim();
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

export interface CurrentPick {
  place: MarketPlaceDto | null;
  /** Fiyatın hangi konuma göre seçildiği (ekranda yazılır). */
  basis: 'secilen-yer' | 'arazi-ili' | 'en-yeni-kayit' | 'yok';
}

/**
 * Başlık fiyatının konumu: ÖNCE çiftçinin seçtiği satış yeri, yoksa SEÇİLİ ARAZİNİN ili. GPS konumuna
 * göre seçim YAPILMAZ. İlde kayıt yoksa en yeni kayıt gösterilir ve bu açıkça yazılır.
 */
export function pickCurrent(
  data: { current: MarketPlaceDto | null; places: MarketPlaceDto[]; national: MarketPlaceDto[] },
  fieldProvince: string | null | undefined,
  chosenPlaceId: string | null | undefined,
): CurrentPick {
  const all = [...data.places, ...data.national].filter(hasSource);
  const chosen = chosenPlaceId ? all.find((p) => p.placeId === chosenPlaceId) : undefined;
  if (chosen) return { place: chosen, basis: 'secilen-yer' };
  if (fieldProvince) {
    const inProvince = all
      .filter((p) => p.province && trLower(p.province) === trLower(fieldProvince))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (inProvince[0]) return { place: inProvince[0], basis: 'arazi-ili' };
  }
  const cur = data.current && hasSource(data.current) ? data.current : null;
  return cur ? { place: cur, basis: 'en-yeni-kayit' } : { place: null, basis: 'yok' };
}

/**
 * Yol tarifi bağlantısı (hedef koordinat). Android: geo: şeması cihazın harita uygulamasını açar;
 * iOS: Apple Haritalar; web ve diğerleri: Google Haritalar yol tarifi adresi.
 */
export function directionsUrl(platform: string, lat: number, lon: number, label: string): string {
  const ll = `${lat},${lon}`;
  if (platform === 'android') return `geo:${ll}?q=${ll}(${encodeURIComponent(label)})`;
  if (platform === 'ios') {
    return `http://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(label)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}

/** Fiyat değişim oku: yön ve yüzde yazısı (renk tek başına anlam taşımaz). */
export function changeArrow(trend: MarketTrendDto): { dir: 'up' | 'down' | 'flat'; text: string } {
  if (trend.direction === 'up' || trend.direction === 'down') {
    const pct =
      trend.changePct30d === null
        ? ''
        : ` %${Math.abs(Math.round(trend.changePct30d * 10) / 10).toLocaleString('tr-TR')}`;
    const word = trend.direction === 'up' ? 'Yükseldi' : 'Düştü';
    return { dir: trend.direction, text: `${word}${pct}` };
  }
  return { dir: 'flat', text: trend.direction === 'flat' ? 'Yatay' : 'Veri yok' };
}

/** Ürün sırasına göre görsel yuvası: urun_1 ... urun_6 (6'dan sonra başa döner). */
export function productImageName(index: number) {
  const names = [
    'urun_1.jpg',
    'urun_2.jpg',
    'urun_3.jpg',
    'urun_4.jpg',
    'urun_5.jpg',
    'urun_6.jpg',
  ] as const;
  return names[Math.max(0, index) % names.length]!;
}

export function sourceLine(p: MarketPlaceDto): string {
  return `${t.source}: ${p.source.name} · ${dayText(p.source.date)}`;
}
