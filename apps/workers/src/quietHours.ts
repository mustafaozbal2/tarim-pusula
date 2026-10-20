/**
 * Sessiz saatler: yerel saatle 22:00-06:00 arası bildirim gitmez, don uyarısı hariç.
 * Türkiye yıl boyu UTC+3 kullanır (yaz saati uygulaması yok), bu yüzden sabit kaydırma yeterlidir.
 */
export const TR_UTC_OFFSET_HOURS = 3;
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 6;

export type NotificationKind = 'frost' | 'irrigation' | 'info';

const localHour = (d: Date) => (d.getUTCHours() + TR_UTC_OFFSET_HOURS) % 24;

export function isQuietHour(now: Date): boolean {
  const h = localHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** Sessiz saat bittiği an (yerel 06:00); sessiz saatte değilse `now`. */
export function nextAllowedTime(now: Date): Date {
  if (!isQuietHour(now)) return now;
  const local = new Date(now.getTime() + TR_UTC_OFFSET_HOURS * 3_600_000);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // 22:00-23:59 ise ertesi günün 06:00'sı, 00:00-05:59 ise aynı günün 06:00'sı.
  const target = day + (local.getUTCHours() >= QUIET_START_HOUR ? 24 : 0) * 3_600_000;
  return new Date(target + (QUIET_END_HOUR - TR_UTC_OFFSET_HOURS) * 3_600_000);
}

export type Delivery = { action: 'send' } | { action: 'defer'; until: Date };

/** Don güvenlik uyarısı her saatte gider; diğerleri sessiz saatte sabaha ertelenir. */
export function decideDelivery(kind: NotificationKind, now: Date): Delivery {
  if (kind === 'frost' || !isQuietHour(now)) return { action: 'send' };
  return { action: 'defer', until: nextAllowedTime(now) };
}
