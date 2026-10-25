/**
 * iCalendar (RFC 5545) üretimi: telefon takvimine eklenebilen .ics dosyası.
 * Türkiye kalıcı UTC+3'tedir (2016'dan beri yaz saati yok): VTIMEZONE bu tek kural ile yazılır.
 */

export interface IcsEvent {
  /** Kararlı kimlik (aynı olay yeniden içe aktarılınca çoğalmaz). */
  uid: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD (yerel takvim günü). */
  startDate: string;
  /** YYYY-MM-DD, DAHİL (tüm gün olaylarında); yoksa tek gün. */
  endDate?: string;
  /** Verilirse saatli olay (yerel saat, Europe/Istanbul); yoksa tüm gün. */
  time?: { hour: number; minute: number };
  /** Saatli olayda süre (dk); varsayılan 30. */
  durationMin?: number;
  /** Başlangıçtan kaç dakika önce uyarsın (VALARM); yoksa uyarı yok. */
  alarmMinutesBefore?: number;
}

export interface IcsOptions {
  prodId?: string;
  calendarName?: string;
  /** DTSTAMP için; testte sabitlenir. */
  now?: Date;
}

export const IST_TZID = 'Europe/Istanbul';

/** RFC 5545 §3.3.11: ters bölü, noktalı virgül, virgül ve yeni satır kaçırılır. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const enc = new TextEncoder();

/** RFC 5545 §3.1: satırlar 75 sekizliyi (bayt) aşmaz; uzun satır CRLF + boşlukla katlanır, UTF-8 karakter bölünmez. */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // devam satırı baştaki boşlukla 75'e tamamlanır
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function parseDate(s: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new RangeError(`Tarih YYYY-MM-DD olmalı: ${s}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new RangeError(`Geçersiz tarih: ${s}`);
  }
  return { y, m: mo, d };
}

const compactDate = (s: string) => s.replaceAll('-', '');

/** Gün ekler (YYYY-MM-DD). */
export function icsAddDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function stamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${IST_TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0300',
  'TZNAME:+03',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Saatli olayın bitişi: başlangıç + süre (gün taşabilir). */
function timedEnd(date: string, hour: number, minute: number, durationMin: number) {
  const total = hour * 60 + minute + durationMin;
  const dayShift = Math.floor(total / 1440);
  const rest = total % 1440;
  return { date: icsAddDays(date, dayShift), hour: Math.floor(rest / 60), minute: rest % 60 };
}

export function buildIcs(events: readonly IcsEvent[], opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.prodId ?? '-//Tarım Pusula//Tarla Takvimi//TR'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (opts.calendarName) lines.push(`X-WR-CALNAME:${escapeIcsText(opts.calendarName)}`);
  lines.push(`X-WR-TIMEZONE:${IST_TZID}`);
  if (events.some((e) => e.time)) lines.push(...VTIMEZONE);

  for (const e of events) {
    if (e.alarmMinutesBefore !== undefined && !(e.alarmMinutesBefore >= 0)) {
      throw new RangeError('Uyarı süresi negatif olamaz');
    }
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@tarimpusula`, `DTSTAMP:${stamp(now)}`);
    if (e.time) {
      const { hour, minute } = e.time;
      if (!(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)) {
        throw new RangeError(`Saat geçersiz: ${hour}:${minute}`);
      }
      parseDate(e.startDate);
      const end = timedEnd(e.startDate, hour, minute, e.durationMin ?? 30);
      lines.push(
        `DTSTART;TZID=${IST_TZID}:${compactDate(e.startDate)}T${pad(hour)}${pad(minute)}00`,
        `DTEND;TZID=${IST_TZID}:${compactDate(end.date)}T${pad(end.hour)}${pad(end.minute)}00`,
      );
    } else {
      const last = e.endDate ?? e.startDate;
      if (last < e.startDate) throw new RangeError('Bitiş, başlangıçtan önce olamaz');
      parseDate(e.startDate);
      // Tüm gün olayda DTEND özeldir: bitişten SONRAKİ gün (RFC 5545 §3.6.1).
      lines.push(
        `DTSTART;VALUE=DATE:${compactDate(e.startDate)}`,
        `DTEND;VALUE=DATE:${compactDate(icsAddDays(last, 1))}`,
      );
    }
    lines.push(`SUMMARY:${escapeIcsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.alarmMinutesBefore !== undefined) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(e.title)}`,
        `TRIGGER:-PT${Math.round(e.alarmMinutesBefore)}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
