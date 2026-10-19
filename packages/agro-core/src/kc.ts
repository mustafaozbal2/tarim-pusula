/**
 * FAO-56 (Allen vd., 1998) evreye göre bitki katsayısı (Kc) eğrisi, Şekil 34 / Denklem 66.
 * Evre uzunlukları gün cinsindendir: başlangıç, gelişme, orta, son.
 */
export interface KcStages {
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  lIni: number;
  lDev: number;
  lMid: number;
  lLate: number;
}

export function totalSeasonDays(s: KcStages): number {
  return s.lIni + s.lDev + s.lMid + s.lLate;
}

/** Dikimden sonraki gün sayısına (0'dan başlar) göre Kc. Evre geçişleri doğrusal. */
export function kcForDay(s: KcStages, day: number): number {
  const total = totalSeasonDays(s);
  if (!Number.isFinite(day) || day < 0 || day > total) {
    throw new RangeError(`Gün 0 ile ${total} arasında olmalı: ${day}`);
  }
  if (day <= s.lIni) return s.kcIni;
  if (day <= s.lIni + s.lDev) {
    return s.kcIni + ((day - s.lIni) / s.lDev) * (s.kcMid - s.kcIni);
  }
  if (day <= s.lIni + s.lDev + s.lMid) return s.kcMid;
  return s.kcMid + ((day - s.lIni - s.lDev - s.lMid) / s.lLate) * (s.kcEnd - s.kcMid);
}

/** ETc = Kc × ET0 (FAO-56 Denklem 58), mm/gün. */
export function cropEvapotranspiration(kc: number, et0: number): number {
  if (kc < 0 || et0 < 0) throw new RangeError('Kc ve ET0 negatif olamaz');
  return kc * et0;
}
