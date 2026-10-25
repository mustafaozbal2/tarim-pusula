import { buildIcs, type IcsEvent } from '@tarim/agro-core';
import type { CalendarEventDto } from '../api/client';

/** Takvime aktarılacak faaliyetler: yalnız ONAYLI olanlar (onaysız bilgi çiftçiye hiç gösterilmez). */
export function exportableEvents(events: readonly CalendarEventDto[]): CalendarEventDto[] {
  return events.filter((e) => !e.needsBadge);
}

const sourceText = (e: CalendarEventDto) =>
  `Kaynak: ${e.source} · ${e.sourceVersion} · ${e.sourceDate}`;

/** Faaliyet → iCalendar olayı (tüm gün, bir gün önceden uyarı yok; telefon varsayılanını kullanır). */
export function toIcsEvents(events: readonly CalendarEventDto[], fieldName: string): IcsEvent[] {
  return exportableEvents(events).map((e) => ({
    uid: `${e.templateId}-${e.start}`,
    title: `${e.title} (${fieldName})`,
    description: [e.detail, sourceText(e)].filter(Boolean).join('\n'),
    startDate: e.start,
    endDate: e.end,
  }));
}

export function eventsToIcs(
  events: readonly CalendarEventDto[],
  fieldName: string,
  now = new Date(),
): string {
  return buildIcs(toIcsEvents(events, fieldName), {
    calendarName: `Tarım Pusula · ${fieldName}`,
    now,
  });
}

export const ICS_FILE_NAME = 'tarim-pusula-takvim.ics';

/** expo-calendar için olay girdisi (tüm gün, Türkiye saat dilimi). Test edilebilsin diye saf fonksiyon. */
export function toDeviceEvent(e: CalendarEventDto, fieldName: string) {
  return {
    title: `${e.title} (${fieldName})`,
    notes: [e.detail, sourceText(e)].filter(Boolean).join('\n'),
    startDate: new Date(`${e.start}T00:00:00+03:00`),
    endDate: new Date(`${e.end}T23:59:59+03:00`),
    allDay: true,
    timeZone: 'Europe/Istanbul',
  };
}

/** Telefon takvimine ekleme sonucu (arayüz mesajı buna göre seçilir). */
export type PhoneCalendarResult =
  | { kind: 'added'; count: number }
  | { kind: 'shared' }
  | { kind: 'downloaded' }
  | { kind: 'failed'; message: string };
