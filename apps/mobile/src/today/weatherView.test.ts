import { describe, expect, it } from 'vitest';
import { currentRows, forecastRows } from './weatherView';

describe('Hava Durumu görünümü (G22.6)', () => {
  it('şu an: sıcaklık, hissedilen, nem, rüzgâr (km/sa), yağış', () => {
    const rows = currentRows({
      tempC: 18.4,
      weatherCode: 3,
      apparentC: 16.9,
      rhPct: 47,
      windMs: 3.2,
      precipMm: 0.2,
    });
    expect(rows.map((r) => r.label)).toEqual(['Sıcaklık', 'Hissedilen', 'Nem', 'Rüzgâr', 'Yağış']);
    expect(rows.map((r) => r.value)).toEqual(['18°', '17°', '%47', '12 km/sa', '0,2 mm']);
  });
  it('sağlayıcı vermeyen değer "-" olur, uydurulmaz', () => {
    const rows = currentRows({ tempC: 10, weatherCode: 0 });
    expect(rows[1]!.value).toBe('-');
    expect(currentRows(null).every((r) => r.value === '-')).toBe(true);
  });
  it('5 günlük tahmin: Bugün, Yarın, sonra gün adları', () => {
    const days = [
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ].map((date, i) => ({ date, tMinC: 5 + i, tMaxC: 15 + i, precipMm: i === 1 ? 1.4 : 0 }));
    const rows = forecastRows(days, '2026-10-25');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.day)).toEqual(['Bugün', 'Yarın', 'Salı', 'Çarşamba', 'Perşembe']);
    expect(rows[1]!.rain).toBe('1,4 mm');
    expect(rows[0]!.minMax).toBe('5° / 15°');
  });
});
