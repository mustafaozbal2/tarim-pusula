import { describe, expect, it } from 'vitest';
import { donBildirimi, donTuru, geceDonu, tehlikeler, type SaatlikHava } from './gece';

const saatler = (gun: string, sicak: number[], ruzgar = 1, bulut = 10): SaatlikHava[] =>
  sicak.map((t, i) => {
    const d = new Date(Date.parse(`${gun}T18:00:00Z`) + i * 3_600_000).toISOString();
    return {
      time: `${d.slice(0, 13)}:00`,
      tempC: t,
      dewC: t - 3,
      windMs: ruzgar,
      cloudPct: bulut,
      snowCm: 0,
      precipMm: 0,
    };
  });
// 18:00'den ertesi 09:00'a 16 saat: gece yarısından sonra 03-07 arası eksi.
const GECE = [8, 6, 5, 4, 3, 2, 1, 0.5, 0.2, -0.5, -1.5, -2, -1.2, -0.3, 1, 3];

describe('gece donu (WMO hava donu, FAO 2005 don türü)', () => {
  it('pencere, en düşük, saat aralığı ve süre doğru', () => {
    const g = geceDonu(saatler('2026-11-09', GECE), '2026-11-09T19:30');
    expect(g.var).toBe(true);
    expect(g.sabah).toBe('2026-11-10');
    expect(g.enDusukC).toBe(-2);
    expect(g.enDusukSaat).toBe('05:00');
    expect(g.baslangic).toBe('03:00');
    expect(g.bitis).toBe('07:00');
    expect(g.sure).toBe(5);
    expect(g.tur).toBe('radyasyon');
    expect(g.saatler).toHaveLength(16);
  });
  it('sabah 09:00 öncesinde pencere bu sabahtır; geçmiş saatler sayılmaz', () => {
    const g = geceDonu(saatler('2026-11-09', GECE), '2026-11-10T06:10');
    expect(g.sabah).toBe('2026-11-10');
    expect(g.baslangic).toBe('06:00');
    expect(g.sure).toBe(2);
  });
  it('don yoksa var=false; rüzgârlı gecede adveksiyon', () => {
    expect(
      geceDonu(
        saatler(
          '2026-11-09',
          GECE.map((t) => t + 5),
        ),
        '2026-11-09T20:00',
      ).var,
    ).toBe(false);
    expect(donTuru(4, 80)).toBe('adveksiyon');
    expect(donTuru(1, 90)).toBe('karisik');
    expect(donTuru(1, 10)).toBe('radyasyon');
  });
  it('tehlikeler: don, kar, kuvvetli rüzgâr (≥13,9 m/s), kuvvetli yağış', () => {
    const t = tehlikeler(
      [
        { date: '2026-11-09', tMinC: 3, precipMm: 0, snowCm: 0, gustMaxMs: 5 },
        { date: '2026-11-10', tMinC: -3, precipMm: 30, snowCm: 4, gustMaxMs: 15 },
        { date: '2026-11-20', tMinC: -9, precipMm: 0, snowCm: 0, gustMaxMs: 0 },
      ],
      '2026-11-09',
    );
    expect(t.map((x) => x.tur)).toEqual(['don', 'kar', 'ruzgar', 'yagis']);
    expect(t[2]!.baslik).toBe('Yarın kuvvetli rüzgâr (hamle 54 km/sa)');
  });
  it('bildirim metni', () => {
    const g = geceDonu(saatler('2026-11-09', GECE), '2026-11-09T19:30');
    expect(donBildirimi('Ev', g)).toContain(
      'Bu gece Ev arazinizde don bekleniyor: 03:00-07:00 arası en düşük -2°',
    );
  });
});
