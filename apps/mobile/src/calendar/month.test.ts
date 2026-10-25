import { describe, expect, it } from 'vitest';
import type { CalendarEventDto } from '../api/client';
import { eventsOnDate, monthGrid, monthTitle, shiftMonth } from './month';

const ev = (over: Partial<CalendarEventDto>): CalendarEventDto => ({
  templateId: 't',
  title: 'İş',
  detail: '',
  stage: null,
  start: '2026-11-10',
  end: '2026-11-12',
  ongoing: false,
  needsBadge: false,
  actionable: true,
  source: 's',
  sourceVersion: 'v1',
  sourceDate: '2026-01-01',
  why: '',
  ...over,
});

describe('monthGrid', () => {
  // 1 Kasım 2026 Pazar → ızgara 26 Ekim Pazartesi'den başlar (6 hafta: 26 Ekim - 6 Aralık)
  const grid = monthGrid(2026, 11, [ev({})], '2026-11-11');

  it('haftalar Pazartesi başlar, her hafta 7 gün', () => {
    for (const w of grid) expect(w).toHaveLength(7);
    expect(grid[0]![0]!.date).toBe('2026-10-26');
    expect(grid[0]![6]!.date).toBe('2026-11-01');
  });

  it('Kasım 2026: 30 gün, ilk gün Pazar ⇒ 6 hafta', () => {
    expect(grid).toHaveLength(6);
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid[5]![0]!.date).toBe('2026-11-30');
  });

  it('şubat 2027 tam 4 hafta (1 Şubat Pazartesi, 28 gün)', () => {
    const g = monthGrid(2027, 2, [], '2027-02-10');
    expect(g).toHaveLength(4);
    expect(g[0]![0]!.date).toBe('2027-02-01');
    expect(g[3]![6]!.date).toBe('2027-02-28');
  });

  it('artık yıl şubatı 29 gün', () => {
    const g = monthGrid(2028, 2, [], '2028-02-10');
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(29);
  });

  it('bugün işaretlenir; faaliyet aralığının her gününe işaret konur', () => {
    const cells = grid.flat();
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual(['2026-11-11']);
    expect(cells.filter((c) => c.events.length > 0).map((c) => c.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
  });

  it('yıl dönümü: Aralık ızgarası Ocak günleriyle biter', () => {
    const g = monthGrid(2026, 12, [], '2026-12-01');
    const last = g[g.length - 1]![6]!;
    expect(last.inMonth).toBe(false);
    expect(last.date.startsWith('2027-01')).toBe(true);
  });

  it('geçersiz ay hata verir', () => {
    expect(() => monthGrid(2026, 13, [], '2026-01-01')).toThrow();
  });
});

describe('eventsOnDate', () => {
  it('onaysız faaliyet gün işareti üretmez (çiftçi ekranında gizli)', () => {
    expect(eventsOnDate([ev({ needsBadge: true })], '2026-11-10')).toEqual([]);
  });
  it('sınır günleri dahildir', () => {
    expect(eventsOnDate([ev({})], '2026-11-10')).toHaveLength(1);
    expect(eventsOnDate([ev({})], '2026-11-12')).toHaveLength(1);
    expect(eventsOnDate([ev({})], '2026-11-13')).toHaveLength(0);
  });
});

describe('shiftMonth / monthTitle', () => {
  it('yıl sınırını aşar', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
    expect(shiftMonth(2026, 11, 14)).toEqual({ year: 2028, month: 1 });
  });
  it('başlık', () => {
    expect(monthTitle(2026, 11)).toBe('Kasım 2026');
  });
});
