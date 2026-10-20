/**
 * FAO-56 Penman-Monteith referans evapotranspirasyonu (Allen vd., 1998, Denklem 6) ve yardımcı
 * denklemler. Birimler: sıcaklık °C, basınç kPa, radyasyon MJ m-2 gün-1, rüzgâr m/s, sonuç mm/gün.
 */
const GSC = 0.082; // güneş sabiti, MJ m-2 dk-1
const SIGMA = 4.903e-9; // Stefan-Boltzmann, MJ K-4 m-2 gün-1

/** Doygun buhar basıncı e°(T), kPa (Denk. 11). */
export function saturationVaporPressure(tC: number): number {
  return 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
}

/** Doygun buhar basıncı eğrisinin eğimi Δ, kPa/°C (Denk. 13). */
export function vaporPressureSlope(tC: number): number {
  return (4098 * saturationVaporPressure(tC)) / (tC + 237.3) ** 2;
}

/** Deniz seviyesinden yüksekliğe göre atmosfer basıncı, kPa (Denk. 7). */
export function atmosphericPressure(elevationM: number): number {
  return 101.3 * ((293 - 0.0065 * elevationM) / 293) ** 5.26;
}

/** Psikrometrik sabit γ, kPa/°C (Denk. 8). */
export function psychrometricConstant(pressureKpa: number): number {
  return 0.000665 * pressureKpa;
}

/** Rüzgâr hızını 2 m'ye indirger (Denk. 47). */
export function windAt2m(u: number, heightM: number): number {
  if (heightM <= 0.5) throw new RangeError('Ölçüm yüksekliği 0,5 m üstünde olmalı');
  return (u * 4.87) / Math.log(67.8 * heightM - 5.42);
}

/** Yılın günü (1-366), UTC takvim günü. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((day - start) / 86_400_000);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Atmosfer dışı radyasyon Ra, MJ m-2 gün-1 (Denk. 21) ve gün uzunluğu N, saat (Denk. 34). */
export function extraterrestrialRadiation(
  latDeg: number,
  doy: number,
): { ra: number; daylightHours: number } {
  const phi = rad(latDeg);
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const x = Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta)));
  const ws = Math.acos(x);
  const ra =
    ((24 * 60) / Math.PI) *
    GSC *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return { ra, daylightHours: (24 / Math.PI) * ws };
}

export interface Et0Input {
  tMinC: number;
  tMaxC: number;
  /** Güneşlenme süresi (saat); Rs yoksa Ångström ile Rs hesaplanır. */
  sunshineHours?: number;
  /** Kısa dalga radyasyon (MJ m-2 gün-1). */
  solarRadiation?: number;
  /** Gerçek buhar basıncı (kPa). Yoksa bağıl nemden ya da Tmin'den hesaplanır. */
  actualVaporPressureKpa?: number;
  rhMaxPct?: number;
  rhMinPct?: number;
  rhMeanPct?: number;
  windSpeed: number;
  /** Rüzgâr ölçüm yüksekliği (m); verilmezse 2 m kabul edilir. */
  windHeightM?: number;
  elevationM: number;
  latitudeDeg: number;
  dayOfYear: number;
}

export interface Et0Result {
  et0: number;
  rn: number;
  rs: number;
  es: number;
  ea: number;
  delta: number;
  gamma: number;
  u2: number;
}

/**
 * Günlük ET0 (mm/gün). Rs sırası: verilen Rs → güneşlenmeden (Ångström 0,25/0,50) → Hargreaves (Denk. 50).
 * Ea sırası: verilen → RHmax+RHmin → RHmean → Tmin−2 (Denk. 48).
 */
export function et0PenmanMonteith(i: Et0Input): Et0Result {
  if (i.tMaxC < i.tMinC) throw new RangeError('Tmax, Tmin değerinden küçük olamaz');
  const tMean = (i.tMaxC + i.tMinC) / 2;
  const wind = Math.max(i.windSpeed, 0);
  const u2raw = i.windHeightM === undefined ? wind : windAt2m(wind, i.windHeightM);
  const u2 = Math.max(u2raw, 0.5); // FAO-56 §3: u2 en az 0,5 m/s
  const gamma = psychrometricConstant(atmosphericPressure(i.elevationM));
  const delta = vaporPressureSlope(tMean);
  const es = (saturationVaporPressure(i.tMaxC) + saturationVaporPressure(i.tMinC)) / 2;

  let ea: number;
  if (i.actualVaporPressureKpa !== undefined) ea = i.actualVaporPressureKpa;
  else if (i.rhMaxPct !== undefined && i.rhMinPct !== undefined) {
    ea =
      (saturationVaporPressure(i.tMinC) * (i.rhMaxPct / 100) +
        saturationVaporPressure(i.tMaxC) * (i.rhMinPct / 100)) /
      2;
  } else if (i.rhMeanPct !== undefined) ea = (i.rhMeanPct / 100) * es;
  else ea = saturationVaporPressure(i.tMinC - 2);
  ea = Math.min(ea, es);

  const { ra, daylightHours } = extraterrestrialRadiation(i.latitudeDeg, i.dayOfYear);
  let rs: number;
  if (i.solarRadiation !== undefined) rs = i.solarRadiation;
  else if (i.sunshineHours !== undefined)
    rs = (0.25 + 0.5 * (i.sunshineHours / daylightHours)) * ra;
  else rs = Math.min(0.16 * Math.sqrt(i.tMaxC - i.tMinC) * ra, 0.75 * ra);

  const rso = (0.75 + 2e-5 * i.elevationM) * ra; // açık gökyüzü (Denk. 37)
  const rns = 0.77 * rs; // Denk. 38
  const ratio = rso > 0 ? Math.min(1, Math.max(0.3, rs / rso)) : 0.5;
  const rnl =
    SIGMA *
    (((i.tMaxC + 273.16) ** 4 + (i.tMinC + 273.16) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(ea)) *
    (1.35 * ratio - 0.35); // Denk. 39
  const rn = rns - rnl;

  const num = 0.408 * delta * rn + ((gamma * 900) / (tMean + 273)) * u2 * (es - ea);
  const den = delta + gamma * (1 + 0.34 * u2);
  return { et0: Math.max(0, num / den), rn, rs, es, ea, delta, gamma, u2 };
}
