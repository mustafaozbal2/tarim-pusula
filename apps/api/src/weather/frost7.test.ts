import { describe, expect, it } from 'vitest';
import type { CropStage } from '@tarim/agro-core';
import type { WeatherBundle } from './openmeteo';
import { FROST_HORIZON_DAYS, frostCard } from './today';

/** 2026-11-07 sabahı, UTC+3. Her gün için ensemble üyelerinin Tmin'i ve yağış verilir. */
function bundle(days: { min: number; precip?: number }[]): WeatherBundle {
  const dates = days.map((_, i) => `2026-11-${String(7 + i).padStart(2, '0')}`);
  return {
    source: 'test',
    fetchedAt: '2026-11-07T05:00:00Z',
    stale: false,
    elevationM: 800,
    utcOffsetSeconds: 3 * 3600,
    current: null,
    days: days.map((d, i) => ({
      date: dates[i]!,
      tMinC: d.min,
      tMaxC: d.min + 10,
      shortwaveMjM2: 10,
      rhMeanPct: 70,
      windMeanMs: 1,
      precipMm: d.precip ?? 0,
      et0OpenMeteoMm: 1,
    })),
    ensemble: {
      model: 'test',
      elevationM: 800,
      days: days.map((d, i) => ({
        date: dates[i]!,
        minC: Array.from({ length: 20 }, () => d.min),
      })),
    },
  };
}

const stage = (status: CropStage['reviewStatus'] = 'uzman-onayli'): CropStage => ({
  seq: 1,
  name: 'Çiçeklenme',
  kc: 1,
  frostCriticalC: -2,
  reviewStatus: status,
});

const input = (b: WeatherBundle, status: CropStage['reviewStatus'] = 'uzman-onayli') => ({
  field: { id: 'f', name: 'Tarla', lat: 37, lon: 37, cropId: 'antep-fistigi' },
  bundle: b,
  pack: { reviewStatus: 'uzman-onayli' as const, kcMid: 1, version: 1, source: 's' },
  stages: [stage(status)],
  now: new Date('2026-11-07T05:00:00Z'), // yerel 08:00: bugünün sabahı henüz geçmedi
});

describe('7 günlük don görünümü', () => {
  it('ufuk 7 gündür', () => {
    expect(FROST_HORIZON_DAYS).toBe(7);
  });

  it('5. günde don olacaksa (eşik onaylı) 7 günlük pencerede bulunur ve görünüme girer', () => {
    const b = bundle([
      { min: 5 },
      { min: 4 },
      { min: 3 },
      { min: 3 },
      { min: -5 },
      { min: 2 },
      { min: 2 },
    ]);
    const c = frostCard(input(b));
    expect(c.assessment.kind).toBe('frost');
    expect(c.date).toBe('2026-11-11');
    expect(c.dayOffset).toBe(4);
    expect(c.outlook).toHaveLength(7);
    expect(c.outlook[4]).toMatchObject({ probability: 1, level: 'warning', dayOffset: 4 });
    expect(c.outlook[0]).toMatchObject({ probability: 0, level: 'none' });
  });

  it('birden çok uyarı gününde EN ERKEN gün seçilir (ilk tehlikeyi bilsin)', () => {
    const b = bundle([
      { min: 5 },
      { min: -4 },
      { min: 3 },
      { min: -6 },
      { min: 2 },
      { min: 2 },
      { min: 2 },
    ]);
    const c = frostCard(input(b));
    expect(c.date).toBe('2026-11-08');
    expect(c.dayOffset).toBe(1);
  });

  it('uyarı yoksa en yüksek olasılıklı gün seçilir', () => {
    const b = bundle([
      { min: 5 },
      { min: 3 },
      { min: 3 },
      { min: 3 },
      { min: 3 },
      { min: 3 },
      { min: 3 },
    ]);
    const c = frostCard(input(b));
    expect(c.assessment.kind === 'frost' && c.assessment.level).toBe('none');
    expect(c.date).toBe('2026-11-07'); // eşitlikte en erken
  });

  it('eksi sıcaklık + yağış birlikte "icing" olgusu olarak işaretlenir', () => {
    const b = bundle([
      { min: 3 },
      { min: -3, precip: 4 },
      { min: -3, precip: 0 },
      { min: 3 },
      { min: 3 },
      { min: 3 },
      { min: 3 },
    ]);
    const c = frostCard(input(b));
    expect(c.outlook[1]!.icing).toBe(true);
    expect(c.outlook[2]!.icing).toBe(false);
  });

  it('eşik onaysızsa olasılık/uyarı üretilmez; yalnız tahmin edilen sıcaklık ve yağış gösterilir (kural 1)', () => {
    const b = bundle([
      { min: -5 },
      { min: -6, precip: 2 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
    ]);
    const c = frostCard(input(b, 'taslak-uzman-onayi-bekliyor'));
    expect(c.assessment.kind).toBe('none');
    expect(c.outlook.length).toBe(7);
    for (const d of c.outlook) {
      expect(d.probability).toBeNull();
      expect(d.level).toBeNull();
    }
    expect(c.outlook[1]).toMatchObject({ tMinC: -6, precipMm: 2, icing: true });
  });

  it('ensemble yoksa olasılık uydurulmaz', () => {
    const b = bundle([
      { min: -5 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
      { min: 1 },
    ]);
    b.ensemble = null;
    const c = frostCard(input(b));
    expect(c.assessment.kind).toBe('none');
    expect(c.outlook.every((d) => d.probability === null)).toBe(true);
  });
});
