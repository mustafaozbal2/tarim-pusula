/** Derece-gün (GDD) ve yükselti düzeltmesi. */

/** Standart atmosfer dikey sıcaklık düşüş oranı: 6,5 °C/km. */
export const LAPSE_RATE_C_PER_KM = 6.5;

/**
 * Hava modelinin yüksekliğinden (modelElevationM) parselin yüksekliğine sıcaklık düzeltmesi.
 * Parsel daha yüksekse soğuk: T_parsel = T_model − 6,5 °C/km × (h_parsel − h_model)/1000.
 */
export function adjustTempForElevation(
  tC: number,
  modelElevationM: number,
  siteElevationM: number,
): number {
  return tC - (LAPSE_RATE_C_PER_KM * (siteElevationM - modelElevationM)) / 1000;
}

/**
 * Günlük derece-gün (McMaster ve Wilhelm, 1997): sıcaklıklar [tBase, tCap] arasına kırpılır,
 * GDD = (Tmax' + Tmin')/2 − Tbase. tCap verilmezse üst sınır yok.
 */
export function dailyGdd(tMinC: number, tMaxC: number, tBaseC: number, tCapC?: number): number {
  if (tMaxC < tMinC) throw new RangeError('Tmax, Tmin değerinden küçük olamaz');
  const clamp = (t: number) => Math.max(tBaseC, tCapC === undefined ? t : Math.min(t, tCapC));
  return (clamp(tMaxC) + clamp(tMinC)) / 2 - tBaseC;
}

/** Günlük (Tmin, Tmax) çiftlerinden birikimli GDD. */
export function accumulatedGdd(
  days: { tMinC: number; tMaxC: number }[],
  tBaseC: number,
  tCapC?: number,
): number {
  return days.reduce((s, d) => s + dailyGdd(d.tMinC, d.tMaxC, tBaseC, tCapC), 0);
}
