import { describe, expect, it } from 'vitest';
import type { FrostDayDto } from '../api/client';
import { donGorunumu } from './model';
describe('7 gecelik don görünümü', () => {
  const d = (over: Partial<FrostDayDto>): FrostDayDto => ({
    date: '2026-11-08',
    dayOffset: 1,
    probability: null,
    level: null,
    tMinC: 1,
    precipMm: 0,
    icing: false,
    ...over,
  });
  it('onaylı eşikle olasılık ve düzey; yoksa yalnız sıcaklık, uyarı dili yok (kural 1)', () => {
    const rows = donGorunumu(
      [
        d({ probability: 0.8, level: 'warning', tMinC: -3 }),
        d({ date: '2026-11-09', dayOffset: 2, probability: 0.3, level: 'watch' }),
        d({ date: '2026-11-10', dayOffset: 3, probability: 0, level: 'none' }),
        d({ date: '2026-11-11', dayOffset: 4 }),
      ],
      '2026-11-07',
    );
    expect(rows[0]).toMatchObject({
      day: 'Yarın sabah',
      tone: 'warning',
      temp: 'Gece en düşük -3°',
    });
    expect(rows[0]!.label).toBe('Don bekleniyor (olasılık %80)');
    expect(rows[1]!.label).toBe('Don olabilir (olasılık %30)');
    expect(rows[2]!.label).toBe('Don beklenmiyor');
    expect(rows[3]).toMatchObject({ tone: 'info', label: 'Soğuk gece (tahmin)' });
    expect(donGorunumu(undefined, '2026-11-07')).toEqual([]);
  });
  it('yağış + eksi sıcaklık notu', () => {
    expect(donGorunumu([d({ icing: true })], '2026-11-07')[0]!.note).toMatch(/buzlanma/);
  });
});
