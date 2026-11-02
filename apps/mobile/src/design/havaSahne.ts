/**
 * Ana sayfa üst bandındaki hava efekti: o anki WMO hava kodundan (Open-Meteo `weather_code`) sahne.
 * Kod tablosu: https://open-meteo.com/en/docs (WMO Weather interpretation codes).
 */
export type HavaSahne = 'gunes' | 'gece' | 'bulut' | 'sis' | 'yagmur' | 'firtina' | 'kar' | 'yok';

export function havaSahnesi(code: number | null | undefined, hour: number): HavaSahne {
  if (code === null || code === undefined || !Number.isFinite(code)) return 'yok';
  const gunduz = hour >= 7 && hour < 19;
  if (code <= 1) return gunduz ? 'gunes' : 'gece';
  if (code <= 3) return 'bulut';
  if (code === 45 || code === 48) return 'sis';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'kar';
  if (code >= 95) return 'firtina';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'yagmur';
  return 'yok';
}

/** Parçacık sayısı: performans için az ve sabit (cihazı yormaz). */
export const PARCACIK: Record<HavaSahne, number> = {
  gunes: 0,
  gece: 7,
  bulut: 0,
  sis: 0,
  yagmur: 14,
  firtina: 22,
  kar: 16,
  yok: 0,
};

/** Tekrarlanabilir sözde rastgele (her açılışta aynı dağılım; titreme yok). */
export function tohum(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
