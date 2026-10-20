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

export function sourceLine(p: MarketPlaceDto): string {
  return `${t.source}: ${p.source.name} · ${dayText(p.source.date)}`;
}
