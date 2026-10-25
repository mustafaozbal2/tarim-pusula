import { describe, expect, it } from 'vitest';
import { icsAddDays, buildIcs, escapeIcsText, foldLine, type IcsEvent } from './ics';

const NOW = new Date('2026-10-25T08:30:15Z');
const bytes = (s: string) => new TextEncoder().encode(s).length;
const unfold = (s: string) => s.replace(/\r\n /g, '');

const allDay: IcsEvent = {
  uid: 'bud-2026-11-02',
  title: 'Budama',
  description: 'Kış budamasını yap, kuru dalları temizle; alet temizliği şart.',
  startDate: '2026-11-02',
  endDate: '2026-11-20',
};

describe('buildIcs (RFC 5545)', () => {
  const ics = buildIcs([allDay], { now: NOW, calendarName: 'Tarla takvimi' });
  const lines = ics.split('\r\n');

  it('CRLF ile biter, VCALENDAR çerçevesi ve zorunlu özellikler var', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true);
    expect(lines).toContain('END:VCALENDAR');
  });

  it('VEVENT: UID, DTSTAMP (UTC), DTSTART, SUMMARY', () => {
    expect(lines).toContain('UID:bud-2026-11-02@tarimpusula');
    expect(lines).toContain('DTSTAMP:20261025T083015Z');
    expect(lines).toContain('SUMMARY:Budama');
  });

  it('tüm gün olayda DTEND bitişten SONRAKİ gündür (özel/dışlayıcı)', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261102');
    expect(lines).toContain('DTEND;VALUE=DATE:20261121');
  });

  it('tek günlük olay: DTEND ertesi gün; ay ve yıl sonu taşar', () => {
    const one = buildIcs([{ uid: 'a', title: 'X', startDate: '2026-12-31' }], { now: NOW });
    expect(one).toContain('DTSTART;VALUE=DATE:20261231');
    expect(one).toContain('DTEND;VALUE=DATE:20270101');
    expect(icsAddDays('2028-02-28', 1)).toBe('2028-02-29'); // artık yıl
    expect(icsAddDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('virgül, noktalı virgül ve satır sonu kaçırılır', () => {
    expect(escapeIcsText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
    expect(unfold(ics)).toContain(
      'DESCRIPTION:Kış budamasını yap\\, kuru dalları temizle\\; alet temizliği şart.',
    );
  });

  it('hiçbir satır 75 bayttan uzun değildir; katlanmış satır birleşince özgün metni verir', () => {
    const long = 'Çok uzun açıklama: ışık, şeker, öğütülmüş ğ ü ö ç '.repeat(8);
    const out = buildIcs([{ ...allDay, description: long }], { now: NOW });
    for (const l of out.split('\r\n')) expect(bytes(l)).toBeLessThanOrEqual(75);
    expect(unfold(out)).toContain(`DESCRIPTION:${escapeIcsText(long)}`);
  });

  it('foldLine: çok baytlı karakter ortadan bölünmez', () => {
    const folded = foldLine('X:' + 'ş'.repeat(80));
    for (const l of folded.split('\r\n')) expect(bytes(l)).toBeLessThanOrEqual(75);
    expect(unfold(folded)).toBe('X:' + 'ş'.repeat(80));
  });

  it('saatli olay: Europe/Istanbul TZID, VTIMEZONE (+03), süre ve VALARM', () => {
    const out = buildIcs(
      [
        {
          uid: 'sulama-1',
          title: 'Sulama zamanı',
          startDate: '2026-10-26',
          time: { hour: 7, minute: 0 },
          durationMin: 45,
          alarmMinutesBefore: 15,
        },
      ],
      { now: NOW },
    );
    const l = out.split('\r\n');
    expect(l).toContain('TZID:Europe/Istanbul');
    expect(l).toContain('TZOFFSETFROM:+0300');
    expect(l).toContain('TZOFFSETTO:+0300');
    expect(l).toContain('DTSTART;TZID=Europe/Istanbul:20261026T070000');
    expect(l).toContain('DTEND;TZID=Europe/Istanbul:20261026T074500');
    expect(l).toContain('TRIGGER:-PT15M');
    expect(l).toContain('ACTION:DISPLAY');
  });

  it('saatli olay gece yarısını aşarsa bitiş ertesi güne geçer', () => {
    const out = buildIcs(
      [{ uid: 'g', title: 'Gece', startDate: '2026-10-31', time: { hour: 23, minute: 50 } }],
      { now: NOW },
    );
    expect(out).toContain('DTEND;TZID=Europe/Istanbul:20261101T002000');
  });

  it('saatli olay yoksa VTIMEZONE yazılmaz', () => {
    expect(ics).not.toContain('VTIMEZONE');
  });

  it('BEGIN/END sayıları eşleşir', () => {
    const out = buildIcs([allDay, { ...allDay, uid: 'b', time: { hour: 6, minute: 0 } }], {
      now: NOW,
    });
    for (const k of ['VCALENDAR', 'VEVENT']) {
      expect(out.split(`BEGIN:${k}`).length).toBe(out.split(`END:${k}`).length);
    }
  });

  it('geçersiz girdi hata verir', () => {
    expect(() => buildIcs([{ uid: 'x', title: 't', startDate: '2026-02-30' }])).toThrow();
    expect(() =>
      buildIcs([{ uid: 'x', title: 't', startDate: '2026-02-10', endDate: '2026-02-01' }]),
    ).toThrow();
    expect(() =>
      buildIcs([{ uid: 'x', title: 't', startDate: '2026-02-10', time: { hour: 25, minute: 0 } }]),
    ).toThrow();
    expect(() =>
      buildIcs([{ uid: 'x', title: 't', startDate: '2026-02-10', alarmMinutesBefore: -5 }]),
    ).toThrow();
  });
});
