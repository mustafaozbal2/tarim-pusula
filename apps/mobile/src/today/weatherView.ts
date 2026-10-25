import type { DailyDto } from '../api/client';

export interface CurrentDto {
  tempC: number;
  weatherCode: number;
  apparentC?: number | null;
  rhPct?: number | null;
  windMs?: number | null;
  precipMm?: number | null;
}

const fmt = (v: number, digits = 0) =>
  v.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** "Şu an" satırları: sıcaklık, hissedilen, nem, rüzgâr, yağış. Sağlayıcı vermeyen değer "-" olur. */
export function currentRows(c: CurrentDto | null | undefined): { label: string; value: string }[] {
  const or = (v: number | null | undefined, f: (n: number) => string) =>
    v === null || v === undefined ? '-' : f(v);
  return [
    { label: 'Sıcaklık', value: or(c?.tempC, (n) => `${fmt(n)}°`) },
    { label: 'Hissedilen', value: or(c?.apparentC, (n) => `${fmt(n)}°`) },
    { label: 'Nem', value: or(c?.rhPct, (n) => `%${fmt(n)}`) },
    // m/s -> km/sa (x3,6): çiftçi km/sa ile okur.
    { label: 'Rüzgâr', value: or(c?.windMs, (n) => `${fmt(n * 3.6)} km/sa`) },
    { label: 'Yağış', value: or(c?.precipMm, (n) => `${fmt(n, 1)} mm`) },
  ];
}

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** 5 günlük tahmin satırları: gün adı (Bugün/Yarın), en düşük/en yüksek, yağış. */
export function forecastRows(
  days: DailyDto[],
  todayIso: string,
): { key: string; day: string; minMax: string; rain: string }[] {
  const t0 = Date.UTC(...isoParts(todayIso));
  return days.slice(0, 5).map((d) => {
    const t = Date.UTC(...isoParts(d.date));
    const rel = Math.round((t - t0) / 86_400_000);
    const day = rel === 0 ? 'Bugün' : rel === 1 ? 'Yarın' : DAYS[new Date(t).getUTCDay()]!;
    return {
      key: d.date,
      day,
      minMax: `${fmt(d.tMinC)}° / ${fmt(d.tMaxC)}°`,
      rain: d.precipMm === null ? '-' : `${fmt(d.precipMm, 1)} mm`,
    };
  });
}

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return [y, m - 1, d];
}
