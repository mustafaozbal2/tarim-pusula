import type { TodayDto } from '../api/client';

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

export function waterNeedText(w: TodayDto['waterNeed']): string | null {
  return w.kind === 'water-need'
    ? `${w.etcMmPerDay.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm`
    : null;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
