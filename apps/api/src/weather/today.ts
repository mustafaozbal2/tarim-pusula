import {
  adjustTempForElevation,
  assessFrost,
  canDriveAdvice,
  dayOfYear,
  et0PenmanMonteith,
  waterNeedAdvice,
  type CropStage,
  type FrostAssessment,
  type NoAdvice,
  type ReviewStatus,
  type WaterNeedAdvice,
} from '@tarim/agro-core';
import type { DailyWeather, WeatherBundle } from './openmeteo';

export interface TodayInput {
  field: { id: string; name: string; lat: number; lon: number; cropId: string | null };
  bundle: WeatherBundle;
  pack: { reviewStatus: ReviewStatus; kcMid: number; version: number; source: string } | null;
  stages: CropStage[];
  now: Date;
  /** Parselin deniz seviyesinden yüksekliği; verilmezse Open-Meteo'nun nokta yüksekliği kullanılır. */
  siteElevationM?: number;
}

/** Yerel saat dilimi kaydırmasıyla "şimdi" (UTC alanları yerel saati gösterir). */
export function localParts(now: Date, offsetSeconds: number) {
  const l = new Date(now.getTime() + offsetSeconds * 1000);
  return { date: l.toISOString().slice(0, 10), hour: l.getUTCHours() };
}

export function et0ForDay(
  day: DailyWeather,
  field: { lat: number },
  elevationM: number,
): { mmPerDay: number; method: string } {
  const r = et0PenmanMonteith({
    tMinC: day.tMinC,
    tMaxC: day.tMaxC,
    solarRadiation: day.shortwaveMjM2 ?? undefined,
    rhMeanPct: day.rhMeanPct ?? undefined,
    windSpeed: day.windMeanMs ?? 2,
    windHeightM: day.windMeanMs === null ? undefined : 10,
    elevationM,
    latitudeDeg: field.lat,
    dayOfYear: dayOfYear(new Date(`${day.date}T00:00:00Z`)),
  });
  return { mmPerDay: Math.round(r.et0 * 100) / 100, method: 'FAO-56 Penman-Monteith' };
}

/** Karar için kullanılacak evre: onaylı eşikler arasında en duyarlı (en yüksek kritik sıcaklık). */
export function pickFrostStage(
  stages: CropStage[],
  packStatus: ReviewStatus,
): { frostCriticalC: number | null; reviewStatus: ReviewStatus; name: string } | undefined {
  const withThreshold = stages.filter((s) => s.frostCriticalC !== null);
  const approved = withThreshold.filter((s) => canDriveAdvice(s.reviewStatus));
  const chosen =
    approved.length > 0
      ? approved.reduce((a, b) => (b.frostCriticalC! > a.frostCriticalC! ? b : a))
      : withThreshold[0];
  if (!chosen) return undefined;
  // Paketin kendisi onaysızsa evre eşiği de karar üretmez.
  const reviewStatus = canDriveAdvice(packStatus) ? chosen.reviewStatus : packStatus;
  return { frostCriticalC: chosen.frostCriticalC, reviewStatus, name: chosen.name };
}

const NO_DATA: FrostAssessment = { kind: 'none', reason: 'deger-yok', badge: false };

export interface FrostCard {
  assessment: FrostAssessment;
  /** Olasılığın hesaplandığı sabah (yerel takvim günü). */
  date: string | null;
  /** 0 = bugün sabah, 1 = yarın sabah ... */
  dayOffset: number | null;
  stageName: string | null;
  /** Sıcaklıklar bu yüksekliğe (m) göre düzeltildi. */
  elevationM: number;
  /** "veri-yok": ensemble alınamadı. */
  unavailable: boolean;
  source: string;
  fetchedAt: string;
}

/**
 * Önümüzdeki 3 sabahın don olasılığı; en yüksek olasılıklı gün seçilir (eşitlikte en erken).
 * Bugünün sabahı yerel 09:00'dan sonra geçmiş sayılır.
 */
export function frostCard(i: TodayInput): FrostCard {
  const { bundle } = i;
  const site = i.siteElevationM ?? bundle.elevationM;
  const base = {
    elevationM: site,
    source: bundle.ensemble
      ? `${bundle.source}; topluluk modeli ${bundle.ensemble.model}`
      : bundle.source,
    fetchedAt: bundle.fetchedAt,
  };
  const stage = i.pack ? pickFrostStage(i.stages, i.pack.reviewStatus) : undefined;
  if (!stage) {
    // Evre/eşik verisi yok. Paket onaysızsa çiftçiye bunun "uzman onayı bekliyor" olduğu söylenir.
    const pending = i.pack !== null && !canDriveAdvice(i.pack.reviewStatus);
    return {
      ...base,
      assessment: pending ? { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true } : NO_DATA,
      date: null,
      dayOffset: null,
      stageName: null,
      unavailable: false,
    };
  }
  if (!bundle.ensemble) {
    return {
      ...base,
      assessment: NO_DATA,
      date: null,
      dayOffset: null,
      stageName: stage.name,
      unavailable: true,
    };
  }
  const { date: today, hour } = localParts(i.now, bundle.utcOffsetSeconds);
  const window = bundle.ensemble.days
    .filter((d) => d.date > today || (d.date === today && hour < 9))
    .slice(0, 3);
  let best: { a: FrostAssessment; date: string } | null = null;
  for (const d of window) {
    const adj = d.minC.map((t) => adjustTempForElevation(t, bundle.ensemble!.elevationM, site));
    const a = assessFrost(stage, adj);
    if (a.kind !== 'frost') {
      best ??= { a, date: d.date };
      break; // eşik yok/onaysız: tüm günler için aynı sonuç
    }
    if (!best || best.a.kind !== 'frost' || a.probability > best.a.probability)
      best = { a, date: d.date };
  }
  if (!best) {
    return {
      ...base,
      assessment: NO_DATA,
      date: null,
      dayOffset: null,
      stageName: stage.name,
      unavailable: true,
    };
  }
  const offset = Math.round(
    (Date.parse(`${best.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  return {
    ...base,
    assessment: best.a,
    date: best.date,
    dayOffset: offset,
    stageName: stage.name,
    unavailable: false,
  };
}

export interface TodayResponse {
  fieldId: string;
  fieldName: string;
  generatedAt: string;
  weather: {
    source: string;
    version: string | null;
    sample: boolean;
    fetchedAt: string;
    stale: boolean;
    elevationM: number;
    current: WeatherBundle['current'];
    today: DailyWeather;
    days: DailyWeather[];
  };
  et0: { mmPerDay: number; method: string; openMeteoMmPerDay: number | null };
  waterNeed: (WaterNeedAdvice | NoAdvice) & {
    cropId?: string;
    packVersion?: number;
    source?: string;
  };
  frost: FrostCard;
}

export function buildToday(i: TodayInput): TodayResponse {
  const { bundle } = i;
  const { date } = localParts(i.now, bundle.utcOffsetSeconds);
  const today = bundle.days.find((d) => d.date === date) ?? bundle.days[0]!;
  const elevation = i.siteElevationM ?? bundle.elevationM;
  const et0 = et0ForDay(today, i.field, elevation);
  const advice =
    i.pack === null
      ? ({ kind: 'none', reason: 'deger-yok', badge: true } satisfies NoAdvice)
      : waterNeedAdvice(
          { reviewStatus: i.pack.reviewStatus, kcMid: i.pack.kcMid },
          undefined,
          et0.mmPerDay,
        );
  return {
    fieldId: i.field.id,
    fieldName: i.field.name,
    generatedAt: i.now.toISOString(),
    weather: {
      source: bundle.source,
      version: bundle.version ?? null,
      sample: bundle.sample ?? false,
      fetchedAt: bundle.fetchedAt,
      stale: bundle.stale,
      elevationM: elevation,
      current: bundle.current,
      today,
      days: bundle.days,
    },
    et0: { ...et0, openMeteoMmPerDay: today.et0OpenMeteoMm },
    waterNeed:
      i.pack && i.field.cropId
        ? { ...advice, cropId: i.field.cropId, packVersion: i.pack.version, source: i.pack.source }
        : advice,
    frost: frostCard(i),
  };
}
