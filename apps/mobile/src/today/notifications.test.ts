import { describe, expect, it } from 'vitest';
import type { TodayDto } from '../api/client';
import { buildNotifications } from './notifications';

function today(over: Partial<TodayDto['frost']> = {}, water: TodayDto['waterNeed'] | null = null) {
  return {
    fieldId: 'f',
    fieldName: 'Tarla',
    generatedAt: '2026-10-24T08:00:00Z',
    weather: {
      source: 'Open-Meteo',
      fetchedAt: '2026-10-24T08:00:00Z',
      stale: false,
      elevationM: 600,
      current: { tempC: 12, weatherCode: 2 },
      today: { date: '2026-10-24', tMinC: 3.2, tMaxC: 17.8, precipMm: 0 },
    },
    et0: { mmPerDay: 3.88, method: 'FAO-56' },
    waterNeed: water ?? { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true },
    frost: {
      assessment: { kind: 'none', reason: 'uzman-onayi-bekliyor' },
      date: null,
      dayOffset: null,
      stageName: null,
      unavailable: false,
      source: 'Open-Meteo',
      fetchedAt: '2026-10-24T08:00:00Z',
      ...over,
    },
  } as unknown as TodayDto;
}

describe('buildNotifications', () => {
  it('onaysız eşikte don ve su satırı hiç yoktur; "onay bekliyor" yazısı çıkmaz', () => {
    const rows = buildNotifications(today());
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.some((r) => r.id === 'don' || r.id === 'su')).toBe(false);
    expect(rows.some((r) => r.tone === 'warning')).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/onayı bekl/i);
  });

  it('sıcaklık satırı yuvarlanmış değer verir, yağış yokken yağış satırı yoktur', () => {
    const rows = buildNotifications(today());
    expect(rows.find((r) => r.id === 'sicaklik')?.title).toBe('En düşük 3°, en yüksek 18°');
    expect(rows.some((r) => r.id === 'yagis')).toBe(false);
  });

  it('onaylı don uyarısı satırı uyarı tonundadır', () => {
    const rows = buildNotifications(
      today({
        assessment: {
          kind: 'frost',
          level: 'warning',
          probability: 1,
          members: 20,
          thresholdC: -2,
          medianMinC: -3,
        },
        dayOffset: 1,
        date: '2026-10-25',
      } as unknown as Partial<TodayDto['frost']>),
    );
    expect(rows.find((r) => r.id === 'don')).toMatchObject({
      title: 'Bu gece don bekleniyor',
      tone: 'warning',
    });
  });
});
