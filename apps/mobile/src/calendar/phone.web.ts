import type { CalendarEventDto } from '../api/client';
import { eventsToIcs, exportableEvents, ICS_FILE_NAME, type PhoneCalendarResult } from './export';

/** Web: .ics dosyası indirilir (telefon takvimi tarayıcıdan yazılamaz). */
export async function shareIcs(
  events: readonly CalendarEventDto[],
  fieldName: string,
): Promise<PhoneCalendarResult> {
  const list = exportableEvents(events);
  if (list.length === 0) return { kind: 'failed', message: 'Eklenecek faaliyet yok.' };
  const blob = new Blob([eventsToIcs(list, fieldName)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ICS_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { kind: 'downloaded' };
}

export const addEventsToPhoneCalendar = shareIcs;
