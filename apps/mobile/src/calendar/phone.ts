import * as Calendar from 'expo-calendar/legacy';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { CalendarEventDto } from '../api/client';
import {
  eventsToIcs,
  exportableEvents,
  ICS_FILE_NAME,
  toDeviceEvent,
  type PhoneCalendarResult,
} from './export';

/** .ics dosyasını yazıp paylaşım penceresini açar (takvim uygulaması "içe aktar" der). */
export async function shareIcs(
  events: readonly CalendarEventDto[],
  fieldName: string,
): Promise<PhoneCalendarResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { kind: 'failed', message: 'Bu cihazda paylaşım kullanılamıyor.' };
    }
    const file = new File(Paths.cache, ICS_FILE_NAME);
    file.create({ overwrite: true });
    file.write(eventsToIcs(events, fieldName));
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/calendar',
      dialogTitle: 'Takvime ekle',
      UTI: 'public.calendar-event',
    });
    return { kind: 'shared' };
  } catch {
    return { kind: 'failed', message: 'Dosya paylaşılamadı.' };
  }
}

/** Yazılabilir bir takvim bulur; yoksa "Tarım Pusula" takvimi oluşturur. */
async function targetCalendarId(): Promise<string | null> {
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = all.find((c) => c.allowsModifications);
  if (writable) return writable.id;
  const source = all.find((c) => c.source)?.source;
  if (!source) return null;
  return Calendar.createCalendarAsync({
    title: 'Tarım Pusula',
    color: '#064D3B',
    entityType: Calendar.EntityTypes.EVENT,
    source,
    name: 'tarim-pusula',
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

/**
 * Telefon takvimine ekler: izin ister; izin verilmezse ya da takvim yoksa .ics dosyasını paylaşır.
 * Yalnız onaylı faaliyetler eklenir.
 */
export async function addEventsToPhoneCalendar(
  events: readonly CalendarEventDto[],
  fieldName: string,
): Promise<PhoneCalendarResult> {
  const list = exportableEvents(events);
  if (list.length === 0) return { kind: 'failed', message: 'Eklenecek faaliyet yok.' };
  try {
    const perm = await Calendar.requestCalendarPermissionsAsync();
    if (perm.status !== 'granted') return shareIcs(list, fieldName);
    const id = await targetCalendarId();
    if (!id) return shareIcs(list, fieldName);
    for (const e of list) await Calendar.createEventAsync(id, toDeviceEvent(e, fieldName));
    return { kind: 'added', count: list.length };
  } catch {
    return shareIcs(list, fieldName);
  }
}
