import { describe, expect, it } from 'vitest';
import type { CalendarEventDto } from '../api/client';
import { eventsToIcs, exportableEvents, toDeviceEvent, toIcsEvents } from './export';

const ev = (over: Partial<CalendarEventDto> = {}): CalendarEventDto => ({
  templateId: 'bud',
  title: 'Budama',
  detail: 'Kış budamasını yap.',
  stage: null,
  start: '2026-11-02',
  end: '2026-11-20',
  ongoing: false,
  needsBadge: false,
  actionable: true,
  source: 'GTHB Rehberi',
  sourceVersion: 'v1',
  sourceDate: '2026-01-01',
  why: '',
  ...over,
});

describe('takvim dışa aktarma (.ics)', () => {
  it('onaysız faaliyet dışa aktarılmaz', () => {
    expect(exportableEvents([ev({ needsBadge: true }), ev({ templateId: 'x' })])).toHaveLength(1);
  });
  it('olay: kararlı UID, başlıkta arazi adı, açıklamada kaynak + sürüm + tarih', () => {
    const [e] = toIcsEvents([ev()], 'Kiraz Bahçesi');
    expect(e).toMatchObject({
      uid: 'bud-2026-11-02',
      title: 'Budama (Kiraz Bahçesi)',
      startDate: '2026-11-02',
      endDate: '2026-11-20',
    });
    expect(e?.description).toContain('Kaynak: GTHB Rehberi · v1 · 2026-01-01');
  });
  it('üretilen dosya RFC 5545 çerçevesinde: CRLF, VERSION, DTEND bitişten sonraki gün', () => {
    const ics = eventsToIcs([ev()], 'Kiraz Bahçesi', new Date('2026-10-25T08:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261102');
    expect(ics).toContain('DTEND;VALUE=DATE:20261121');
    expect(ics).toContain('X-WR-TIMEZONE:Europe/Istanbul');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('liste boşsa da geçerli (olaysız) takvim üretir', () => {
    const ics = eventsToIcs([], 'X');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});

describe('telefon takvimi olay girdisi', () => {
  it('tüm gün, Türkiye saat dilimi, açıklamada kaynak', () => {
    const d = toDeviceEvent(ev(), 'Kiraz Bahçesi');
    expect(d.allDay).toBe(true);
    expect(d.timeZone).toBe('Europe/Istanbul');
    expect(d.startDate.toISOString()).toBe('2026-11-01T21:00:00.000Z'); // 2 Kasım 00:00 (+03:00)
    expect(d.endDate.toISOString()).toBe('2026-11-20T20:59:59.000Z');
    expect(d.notes).toContain('Kaynak: GTHB Rehberi');
    expect(d.title).toBe('Budama (Kiraz Bahçesi)');
  });
});
