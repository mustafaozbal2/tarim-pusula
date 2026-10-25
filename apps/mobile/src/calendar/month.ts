import type { CalendarEventDto } from '../api/client';

export const MONTH_NAMES = [
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
] as const;

/** Türkiye'de hafta Pazartesi başlar. */
export const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export interface MonthCell {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  /** O güne denk gelen faaliyetler (başlangıç ≤ gün ≤ bitiş). */
  events: CalendarEventDto[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Bir güne denk gelen faaliyetler. Onaysız satır çiftçi ekranında yoktur (G19.7). */
export function eventsOnDate(
  events: readonly CalendarEventDto[],
  date: string,
): CalendarEventDto[] {
  return events.filter((e) => !e.needsBadge && e.start <= date && date <= e.end);
}

/**
 * Ayın takvim ızgarası: haftalar Pazartesi'den Pazar'a, ayın ilk haftası önceki ayın günleriyle
 * tamamlanır. `month` 1-12.
 */
export function monthGrid(
  year: number,
  month: number,
  events: readonly CalendarEventDto[],
  today: string,
): MonthCell[][] {
  if (!(month >= 1 && month <= 12)) throw new RangeError('Ay 1-12 olmalı');
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay: 0 = Pazar. Pazartesi = 0 olacak şekilde kaydır.
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - lead + i));
    const date = iso(d);
    const cell: MonthCell = {
      date,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
      isToday: date === today,
      events: eventsOnDate(events, date),
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1]!.push(cell);
  }
  return weeks;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
