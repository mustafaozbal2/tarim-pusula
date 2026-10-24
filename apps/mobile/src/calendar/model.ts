import type { CalendarEventDto } from '../api/client';

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** "2026-03-12" -> "12 Mart". */
export function dayText(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** Tek gün ya da aralık: "12 Mart" / "12 Mart - 20 Nisan". */
export function rangeText(e: Pick<CalendarEventDto, 'start' | 'end'>): string {
  return e.start === e.end ? dayText(e.start) : `${dayText(e.start)} - ${dayText(e.end)}`;
}

export interface CalendarGroups {
  now: CalendarEventDto[];
  soon: CalendarEventDto[];
}

/** Sürenler ("Şimdi") ve henüz başlamamış olanlar ("Yaklaşan"); başlangıca göre sıralı. */
export function groupEvents(events: CalendarEventDto[]): CalendarGroups {
  const byStart = (a: CalendarEventDto, b: CalendarEventDto) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title, 'tr');
  return {
    now: events.filter((e) => e.ongoing).sort(byStart),
    soon: events.filter((e) => !e.ongoing).sort(byStart),
  };
}

/** Kaynak satırı: kurum + sürüm + tarih (kural 6). */
export function eventSource(e: Pick<CalendarEventDto, 'source' | 'sourceVersion' | 'sourceDate'>) {
  return `${e.source} · ${e.sourceVersion} · ${e.sourceDate}`;
}
