import {
  applyLimits,
  DEFAULT_REMINDER_PREFS,
  sanitizeReminderPrefs,
  type ReminderPrefs,
  type SentReminder,
} from '@tarim/agro-core';
import type { Api, ReminderDecisionDto, RemindersDto } from '../api/client';
import type { KV } from '../offline/kv';
import { FIELDS_CACHE, SELECTED } from '../today/load';

const PREFS_KEY = 'reminders.prefs.v1';
const HISTORY_KEY = 'reminders.history.v1';
/** Geçmiş en fazla bu kadar gün tutulur. */
const HISTORY_DAYS = 3;

export async function loadReminderPrefs(kv: KV): Promise<ReminderPrefs> {
  const raw = await kv.get(PREFS_KEY);
  if (!raw) return DEFAULT_REMINDER_PREFS;
  try {
    return sanitizeReminderPrefs(JSON.parse(raw) as Partial<ReminderPrefs>);
  } catch {
    return DEFAULT_REMINDER_PREFS;
  }
}

export async function saveReminderPrefs(
  kv: KV,
  prefs: Partial<ReminderPrefs>,
): Promise<ReminderPrefs> {
  const clean = sanitizeReminderPrefs(prefs);
  await kv.set(PREFS_KEY, JSON.stringify(clean));
  return clean;
}

export async function loadHistory(kv: KV): Promise<SentReminder[]> {
  const raw = await kv.get(HISTORY_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as SentReminder[];
    return Array.isArray(v) ? v.filter((h) => h && typeof h.at === 'string') : [];
  } catch {
    return [];
  }
}

/** Sunucuya gidecek sorgu: kullanıcı eşiği, saat ve aç/kapa durumları. */
export function reminderQuery(prefs: ReminderPrefs): string {
  const p = new URLSearchParams();
  if (prefs.moistureThreshold !== null) p.set('moistureThreshold', String(prefs.moistureThreshold));
  p.set('dailyHour', String(prefs.dailyHour));
  p.set('moistureEnabled', prefs.moistureEnabled ? '1' : '0');
  p.set('dailyEnabled', prefs.dailyEnabled ? '1' : '0');
  return p.toString();
}

export interface CheckResult {
  fieldId: string | null;
  data: RemindersDto | null;
  /** Bu çalıştırmada gönderilen bildirimler. */
  sent: { type: 'nem-esigi' | 'gunluk-sulama'; title: string; body: string }[];
  /** Sınır/sessiz saat nedeniyle ertelenen ya da atlanan kararlar. */
  held: { type: string; reason: string }[];
  error: boolean;
}

type DueDecision = Extract<ReminderDecisionDto, { kind: 'due' }>;
const isDue = (d: ReminderDecisionDto): d is DueDecision => d.kind === 'due';

/**
 * Hatırlatıcı denetimi: seçili araziyi okur, sunucudan kararları (onay kapılı) alır, sessiz saat ve
 * tekrar sınırını uygular, gönderilenleri geçmişe yazar. `notify` cihaz bildirimini verir (web'de yoksa
 * hiçbir şey yapmaz; karar yine döner). Çevrimdışıyken sessizce `error: true` döner.
 */
export async function checkReminders(
  api: Pick<Api, 'reminders'>,
  kv: KV,
  now: Date,
  notify: (n: { title: string; body: string }) => Promise<void>,
): Promise<CheckResult> {
  const out: CheckResult = { fieldId: null, data: null, sent: [], held: [], error: false };
  const rawFields = await kv.get(FIELDS_CACHE);
  const fields = rawFields
    ? (JSON.parse(rawFields) as { fields: { id: string; lat: number | null }[] }).fields
    : [];
  const withPlace = fields.filter((f) => f.lat !== null);
  const selected = await kv.get(SELECTED);
  const field = withPlace.find((f) => f.id === selected) ?? withPlace[0];
  if (!field) return out;
  out.fieldId = field.id;

  const prefs = await loadReminderPrefs(kv);
  let data: RemindersDto;
  try {
    data = await api.reminders(field.id, reminderQuery(prefs));
  } catch {
    out.error = true;
    return out;
  }
  out.data = data;

  const cutoff = now.getTime() - HISTORY_DAYS * 86_400_000;
  const history = (await loadHistory(kv)).filter((h) => Date.parse(h.at) >= cutoff);
  const sentNow: SentReminder[] = [];
  for (const d of [data.moisture, data.daily]) {
    if (!isDue(d)) continue;
    const limited = applyLimits(d, [...history, ...sentNow], now, prefs);
    if (limited.kind !== 'due') {
      out.held.push({ type: d.type, reason: limited.reason });
      continue;
    }
    await notify({ title: d.title, body: d.body });
    sentNow.push({ type: d.type, at: now.toISOString() });
    out.sent.push({ type: d.type, title: d.title, body: d.body });
  }
  await kv.set(HISTORY_KEY, JSON.stringify([...history, ...sentNow]));
  return out;
}

/** Karar nedeninin çiftçi dilinde karşılığı ("Neden yok?"). */
export function reasonText(reason: string): string {
  switch (reason) {
    case 'kapali':
      return 'Bu hatırlatıcı kapalı.';
    case 'cihaz-yok':
      return 'Cihaz ekleyince açılır.';
    case 'onaysiz-veri':
      return 'Bu ürün ve toprak için doğrulanmış bilgi hazır olunca açılır.';
    case 'veri-yok':
      return 'Hesap için gereken bilgi henüz yok.';
    case 'veri-eski':
      return 'Son sensör ölçümü eski; yeni ölçüm gelince bakılır.';
    case 'esik-ustunde':
      return 'Nem eşiğin üstünde; şimdilik sulama gerekmiyor.';
    case 'ihtiyac-yok':
      return 'Bugün için sulama ihtiyacı yok.';
    case 'saat-degil':
      return 'Ayarladığın saat gelince bakılır.';
    case 'sessiz-saat':
      return 'Sessiz saatlerde bildirim gönderilmez.';
    case 'sinir':
      return 'Bildirim sınırına ulaşıldı; tekrar göndermeyiz.';
    default:
      return '';
  }
}
