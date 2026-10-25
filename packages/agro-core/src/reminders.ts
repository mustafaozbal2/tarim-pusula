import { canDriveAdvice, type ReviewStatus } from './review';
import type { IrrigationDecision } from './waterBalance';

/**
 * Sulama hatırlatıcıları (G20): (a) toprak nemi kritik eşiğin altına düşünce, (b) günlük sulama
 * ihtiyacı FAO-56 su dengesinden çıkınca. Değişmez kural 1: Kc/toprak/kök derinliği/p onaylı değilse
 * hatırlatıcı ÜRETİLMEZ. Sessiz saatler ve tekrar sınırı burada, saf fonksiyonla uygulanır.
 */

export interface QuietHours {
  /** Yerel saat 0-23; [startHour, endHour) aralığı sessizdir, gece yarısını aşabilir (22 -> 7). */
  startHour: number;
  endHour: number;
}

export interface ReminderPrefs {
  moistureEnabled: boolean;
  /** Hacimsel nem eşiği (m³/m³). Null: onaylı toprak verisinden hesaplanan kritik eşik. */
  moistureThreshold: number | null;
  dailyEnabled: boolean;
  /** Günlük sulama hatırlatması bu yerel saatten sonra verilir. */
  dailyHour: number;
  quiet: QuietHours;
  /** Bir günde (yerel takvim günü) en çok bu kadar hatırlatıcı. */
  maxPerDay: number;
  /** Aynı türden iki hatırlatıcı arası en az bu kadar saat. */
  minGapHours: number;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  moistureEnabled: true,
  moistureThreshold: null,
  dailyEnabled: true,
  dailyHour: 7,
  quiet: { startHour: 22, endHour: 7 },
  maxPerDay: 3,
  minGapHours: 6,
};

export type ReminderType = 'nem-esigi' | 'gunluk-sulama';

export interface SentReminder {
  type: ReminderType;
  /** ISO zamanı. */
  at: string;
}

export type NoReminderReason =
  | 'kapali'
  | 'cihaz-yok'
  | 'onaysiz-veri'
  | 'veri-yok'
  | 'veri-eski'
  | 'esik-ustunde'
  | 'ihtiyac-yok'
  | 'saat-degil'
  | 'sessiz-saat'
  | 'sinir';

export type ReminderDecision =
  | { kind: 'none'; reason: NoReminderReason }
  | { kind: 'due'; type: ReminderType; title: string; body: string; why: string[] };

/** Türkiye kalıcı UTC+3. Yerel saat (0-23) ve yerel takvim günü. */
export const TR_OFFSET_HOURS = 3;
export function trLocal(now: Date): { hour: number; minute: number; date: string } {
  const l = new Date(now.getTime() + TR_OFFSET_HOURS * 3_600_000);
  return { hour: l.getUTCHours(), minute: l.getUTCMinutes(), date: l.toISOString().slice(0, 10) };
}

export function isQuietHour(hour: number, q: QuietHours): boolean {
  if (q.startHour === q.endHour) return false;
  return q.startHour < q.endHour
    ? hour >= q.startHour && hour < q.endHour
    : hour >= q.startHour || hour < q.endHour;
}

/**
 * Kritik hacimsel nem: Dr = RAW olduğunda θ = θFC − p (θFC − θWP). Bu eşiğin altında bitki su
 * sıkıntısına girmeye başlar (FAO-56, Denklem 83 ve Dr = 1000 (θFC − θ) Zr).
 */
export function criticalMoisture(thetaFc: number, thetaWp: number, p: number): number {
  if (!(thetaFc > thetaWp) || thetaWp < 0 || thetaFc > 1) {
    throw new RangeError("θFC, θWP'den büyük ve 0..1 arasında olmalı");
  }
  if (!(p > 0 && p < 1)) throw new RangeError('p 0 ile 1 arasında olmalı');
  return thetaFc - p * (thetaFc - thetaWp);
}

export interface MoistureInput {
  prefs: ReminderPrefs;
  /** Arazide nem sensörü var mı (cihaz yetenekleri). */
  hasSensor: boolean;
  /** Kc + toprak + kök derinliği + p durumları; biri onaysızsa hatırlatıcı yok. */
  reviews: readonly ReviewStatus[];
  thetaFc: number;
  thetaWp: number;
  /** Tablo değeri p (ETc düzeltmesi sonrası). */
  p: number;
  latest: { theta: number; at: string } | null;
  now: Date;
}

/** Ölçüm bu kadar saatten eskiyse karar verilmez (eski veriyle uyarı yok). */
export const MAX_READING_AGE_HOURS = 6;

/** Kullanıcı eşiği [θWP, θFC] içine sıkıştırılır (aralık dışı eşik anlamsızdır). */
export function effectiveMoistureThreshold(
  prefs: Pick<ReminderPrefs, 'moistureThreshold'>,
  thetaFc: number,
  thetaWp: number,
  p: number,
): number {
  const t = prefs.moistureThreshold ?? criticalMoisture(thetaFc, thetaWp, p);
  return Math.min(thetaFc, Math.max(thetaWp, t));
}

const pctText = (x: number) =>
  `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

export function evaluateMoistureReminder(i: MoistureInput): ReminderDecision {
  if (!i.prefs.moistureEnabled) return { kind: 'none', reason: 'kapali' };
  if (!i.hasSensor) return { kind: 'none', reason: 'cihaz-yok' };
  if (!i.reviews.every(canDriveAdvice)) return { kind: 'none', reason: 'onaysiz-veri' };
  if (!i.latest || !Number.isFinite(i.latest.theta)) return { kind: 'none', reason: 'veri-yok' };
  const ageH = (i.now.getTime() - Date.parse(i.latest.at)) / 3_600_000;
  if (!(ageH >= 0) || ageH > MAX_READING_AGE_HOURS) return { kind: 'none', reason: 'veri-eski' };
  const threshold = effectiveMoistureThreshold(i.prefs, i.thetaFc, i.thetaWp, i.p);
  if (!(i.latest.theta < threshold)) return { kind: 'none', reason: 'esik-ustunde' };
  return {
    kind: 'due',
    type: 'nem-esigi',
    title: 'Toprak nemi kritik seviyenin altında',
    body: `Ölçülen nem ${pctText(i.latest.theta)}, eşik ${pctText(threshold)}. Sulamayı düşün.`,
    why: [
      `Sensör ölçümü: ${pctText(i.latest.theta)} (${Math.round(ageH * 10) / 10} saat önce)`,
      `Eşik: ${pctText(threshold)} (θFC − p (θFC − θWP), kullanıcı eşiği yoksa)`,
    ],
  };
}

export interface DailyReminderInput {
  prefs: ReminderPrefs;
  /** `decideIrrigation` çıktısı: onay kapıları orada uygulanır. */
  decision: IrrigationDecision;
  /** Arazi alanı (dekar): 1 mm = 1 m³/dekar. */
  areaDecare: number | null;
  now: Date;
}

export function evaluateDailyReminder(i: DailyReminderInput): ReminderDecision {
  if (!i.prefs.dailyEnabled) return { kind: 'none', reason: 'kapali' };
  const d = i.decision;
  if (d.kind === 'none') {
    return {
      kind: 'none',
      reason: d.reason === 'uzman-onayi-bekliyor' ? 'onaysiz-veri' : 'veri-yok',
    };
  }
  if (d.kind === 'skip' || !(d.netDepthMm > 0)) return { kind: 'none', reason: 'ihtiyac-yok' };
  if (trLocal(i.now).hour < i.prefs.dailyHour) return { kind: 'none', reason: 'saat-degil' };
  const mm = Math.round(d.netDepthMm * 10) / 10;
  const volume =
    i.areaDecare && i.areaDecare > 0
      ? ` (yaklaşık ${Math.round(mm * i.areaDecare).toLocaleString('tr-TR')} m³)`
      : '';
  return {
    kind: 'due',
    type: 'gunluk-sulama',
    title: 'Bugün sulama gerekiyor',
    body: `Net ${mm.toLocaleString('tr-TR')} mm su${volume}. ${d.reason}`,
    why: d.steps.map((s) =>
      `${s.label}: ${s.value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${s.unit}`.trim(),
    ),
  };
}

/**
 * Sessiz saat ve tekrar sınırı. Sessiz saatteki hatırlatıcı atılmaz, ertelenir ('sessiz-saat'; bir
 * sonraki denetimde yeniden değerlendirilir). Günlük sulama günde en çok bir kez gider.
 */
export function applyLimits(
  decision: ReminderDecision,
  history: readonly SentReminder[],
  now: Date,
  prefs: Pick<ReminderPrefs, 'quiet' | 'maxPerDay' | 'minGapHours'>,
): ReminderDecision {
  if (decision.kind !== 'due') return decision;
  const local = trLocal(now);
  if (isQuietHour(local.hour, prefs.quiet)) return { kind: 'none', reason: 'sessiz-saat' };
  const today = history.filter((h) => trLocal(new Date(h.at)).date === local.date);
  if (today.length >= prefs.maxPerDay) return { kind: 'none', reason: 'sinir' };
  if (decision.type === 'gunluk-sulama' && today.some((h) => h.type === 'gunluk-sulama')) {
    return { kind: 'none', reason: 'sinir' };
  }
  const last = history
    .filter((h) => h.type === decision.type)
    .map((h) => Date.parse(h.at))
    .reduce((a, b) => Math.max(a, b), -Infinity);
  if (Number.isFinite(last) && now.getTime() - last < prefs.minGapHours * 3_600_000) {
    return { kind: 'none', reason: 'sinir' };
  }
  return decision;
}

/** Ayar doğrulama: geçersiz değerler varsayılana düşer. */
export function sanitizeReminderPrefs(
  raw: Partial<ReminderPrefs> | null | undefined,
): ReminderPrefs {
  const d = DEFAULT_REMINDER_PREFS;
  const r = raw ?? {};
  const hour = (v: unknown, def: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : def;
  return {
    moistureEnabled: typeof r.moistureEnabled === 'boolean' ? r.moistureEnabled : d.moistureEnabled,
    moistureThreshold:
      typeof r.moistureThreshold === 'number' && r.moistureThreshold > 0 && r.moistureThreshold < 1
        ? r.moistureThreshold
        : null,
    dailyEnabled: typeof r.dailyEnabled === 'boolean' ? r.dailyEnabled : d.dailyEnabled,
    dailyHour: hour(r.dailyHour, d.dailyHour),
    quiet: {
      startHour: hour(r.quiet?.startHour, d.quiet.startHour),
      endHour: hour(r.quiet?.endHour, d.quiet.endHour),
    },
    maxPerDay:
      typeof r.maxPerDay === 'number' && r.maxPerDay >= 1 && r.maxPerDay <= 10
        ? Math.floor(r.maxPerDay)
        : d.maxPerDay,
    minGapHours:
      typeof r.minGapHours === 'number' && r.minGapHours >= 1 && r.minGapHours <= 48
        ? r.minGapHours
        : d.minGapHours,
  };
}
