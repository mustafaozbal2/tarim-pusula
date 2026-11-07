import type { FrostDayDto, TodayDto } from '../api/client';

/** WMO hava kodu → çiftçi dilinde kısa cümle. */
export function weatherText(code: number | undefined): string {
  if (code === undefined) return 'Hava bilgisi yok';
  if (code === 0) return 'Bugün hava açık';
  if (code <= 2) return 'Bugün hava parçalı bulutlu';
  if (code === 3) return 'Bugün hava kapalı';
  if (code === 45 || code === 48) return 'Bugün hava sisli';
  if (code >= 51 && code <= 57) return 'Bugün çisenti var';
  if (code >= 61 && code <= 67) return 'Bugün yağmur var';
  if (code >= 71 && code <= 77) return 'Bugün kar var';
  if (code >= 80 && code <= 82) return 'Bugün sağanak var';
  if (code === 85 || code === 86) return 'Bugün kar sağanağı var';
  if (code >= 95) return 'Bugün gök gürültülü fırtına var';
  return 'Bugün hava değişken';
}

const DAYS = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];

/** Don sabahı `date` ise gece bir önceki akşam başlar: "Cuma gecesi". */
export function frostWhen(dayOffset: number | null, date: string | null): string {
  if (dayOffset === 0) return 'Bu sabah';
  if (dayOffset === 1) return 'Bu gece';
  if (!date) return 'Yakında';
  const night = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000);
  const name = DAYS[night.getUTCDay()]!;
  return `${name.charAt(0).toLocaleUpperCase('tr-TR')}${name.slice(1)} gecesi`;
}

export type FrostCardModel =
  | { kind: 'warning'; title: string; body: string; why: string }
  | { kind: 'watch'; title: string; body: string; why: string }
  | { kind: 'pending'; title: string; body: string }
  | { kind: 'quiet'; title: string; body: string }
  | { kind: 'unavailable'; title: string; body: string };

const pct = (p: number) => `%${Math.round(p * 100)}`;
const deg = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}°`;

/**
 * Don durumu modeli. Onaysız eşikte uyarı üretilmez (değişmez kural 1): çiftçiye "pending" türü
 * yalnız sakin "bilgi yok" metni verir; onay durumu çiftçi ekranında yazılmaz.
 */
export function frostCardModel(f: TodayDto['frost']): FrostCardModel {
  const a = f.assessment;
  if (f.unavailable) {
    return {
      kind: 'unavailable',
      title: 'Don tahmini şu an alınamadı',
      body: 'İnternet gelince yeniden bakarız.',
    };
  }
  if (a.kind === 'none') {
    return a.reason === 'uzman-onayi-bekliyor'
      ? {
          kind: 'pending',
          title: 'Bu ürün için don bilgisi şu an yok',
          body: 'Bilgi hazır olunca burada görünür.',
        }
      : {
          kind: 'quiet',
          title: 'Bu ürün için don bilgisi yok',
          body: 'Ürün seçilince don uyarısı burada görünür.',
        };
  }
  const when = frostWhen(f.dayOffset, f.date);
  const why =
    `Tahmin modelinin ${a.members} denemesinden ${Math.round(a.probability * a.members)} tanesinde ` +
    `en düşük sıcaklık ${deg(a.thresholdC)} ve altına iniyor (olasılık ${pct(a.probability)}). ` +
    `Ortanca tahmin ${deg(a.medianMinC)}.` +
    (f.stageName ? ` Bitkinin evresi: ${f.stageName}.` : '');
  if (a.level === 'warning') {
    return {
      kind: 'warning',
      title: `${when} don bekleniyor`,
      body: `Don olasılığı ${pct(a.probability)}. Bitki zarar görebilir.`,
      why,
    };
  }
  if (a.level === 'watch') {
    return {
      kind: 'watch',
      title: `${when} don ihtimali var`,
      body: `Don olasılığı ${pct(a.probability)}. Hava değişirse haber veririz.`,
      why,
    };
  }
  return {
    kind: 'quiet',
    title: 'Yakın günlerde don beklenmiyor',
    body: `Don olasılığı ${pct(a.probability)}. Bu bilgi tahmindir.`,
  };
}

export interface DonSatiri {
  key: string;
  day: string;
  /** "Gece en düşük -3°" */
  temp: string;
  label: string;
  tone: 'warning' | 'watch' | 'quiet' | 'info';
  note: string | null;
}

const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/**
 * 7 gecelik don görünümü satırları. Olasılık yalnız uzman onaylı eşik varken gelir (kural 1); yoksa yalnız
 * tahmin edilen en düşük sıcaklık gösterilir ve uyarı/öneri dili kullanılmaz.
 */
export function donGorunumu(outlook: FrostDayDto[] | undefined, todayIso: string): DonSatiri[] {
  if (!outlook) return [];
  const t0 = Date.parse(`${todayIso}T00:00:00Z`);
  return outlook.map((d) => {
    const rel = Math.round((Date.parse(`${d.date}T00:00:00Z`) - t0) / 86_400_000);
    const day =
      rel <= 0
        ? 'Bu sabah'
        : rel === 1
          ? 'Yarın sabah'
          : GUN[new Date(Date.parse(`${d.date}T00:00:00Z`)).getUTCDay()]!;
    const temp = d.tMinC === null ? '-' : `Gece en düşük ${Math.round(d.tMinC)}°`;
    const note = d.icing ? 'Yağış ve eksi sıcaklık birlikte: buzlanma ya da kar olabilir.' : null;
    if (d.probability !== null && d.level) {
      const pct = `%${Math.round(d.probability * 100)}`;
      return d.level === 'warning'
        ? {
            key: d.date,
            day,
            temp,
            label: `Don bekleniyor (olasılık ${pct})`,
            tone: 'warning',
            note,
          }
        : d.level === 'watch'
          ? { key: d.date, day, temp, label: `Don olabilir (olasılık ${pct})`, tone: 'watch', note }
          : { key: d.date, day, temp, label: 'Don beklenmiyor', tone: 'quiet', note };
    }
    const cold = d.tMinC !== null && d.tMinC <= 2;
    return {
      key: d.date,
      day,
      temp,
      label: cold ? 'Soğuk gece (tahmin)' : 'Tahmin',
      tone: 'info',
      note,
    };
  });
}

export function waterNeedText(w: TodayDto['waterNeed']): string | null {
  return w.kind === 'water-need'
    ? `${w.etcMmPerDay.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm`
    : null;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
