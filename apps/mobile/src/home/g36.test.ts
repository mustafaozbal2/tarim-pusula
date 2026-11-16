import { describe, expect, it } from 'vitest';
import type { AnnouncementDto } from '../api/client';
import { buildHomeRows, duyuruSekmesi, emptyText, rowsForTab } from './model';

/** G36: resmî haberler konusuna göre kendi sekmesine düşer; başvuru son günü Faaliyet Zamanı'na yazılır. */
const haber = (p: Partial<AnnouncementDto> & { id: string }): AnnouncementDto => ({
  sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
  title: `Haber ${p.id}`,
  body: 'Özet',
  sourceUrl: 'https://gaziantep.tarimorman.gov.tr/Duyuru/1/x',
  publishedAt: '2026-11-10T06:00:00.000Z',
  needsBadge: false,
  why: 'Tarlanız Gaziantep bölgesinde.',
  auto: true,
  ...p,
});

const girdi = (announcements: AnnouncementDto[]) => ({
  calendar: null,
  today: null,
  supports: [],
  announcements,
  todayIso: '2026-11-15',
});

describe('ana sayfa: resmî haberin sekmesi', () => {
  it('kategori → sekme: başvuru/hibe Hibe, önlem Erken Uyarı, bilgilendirme ve teknoloji Rehber, güncel yalnız Hepsi', () => {
    expect(duyuruSekmesi('yonlendirme')).toBe('hibe');
    expect(duyuruSekmesi('onlem')).toBe('uyari');
    expect(duyuruSekmesi('bilgilendirme')).toBe('rehber');
    expect(duyuruSekmesi('teknoloji')).toBe('rehber');
    expect(duyuruSekmesi('guncel')).toBe('duyuru');
    expect(duyuruSekmesi(null)).toBe('duyuru');
    expect(duyuruSekmesi(undefined)).toBe('duyuru');
  });

  it('haberler dört sekmeyi doldurur: Hibe, Erken Uyarı ve Rehber artık boş kalmaz; hepsi Hepsi sekmesinde de görünür', () => {
    const rows = buildHomeRows(
      girdi([
        haber({ id: 'h', category: 'yonlendirme', title: 'Kırsal kalkınma hibe başvuruları' }),
        haber({ id: 'u', category: 'onlem', title: 'Zeytin sineği mücadele uyarısı' }),
        haber({ id: 'r', category: 'bilgilendirme', title: 'Çiftçi eğitimi: budama' }),
        haber({ id: 'g', category: 'guncel', title: 'TÜİK: Süt Üretimi, Eylül 2026' }),
      ]),
    );
    expect(rowsForTab(rows, 'hibe').map((r) => r.title)).toEqual([
      'Kırsal kalkınma hibe başvuruları',
    ]);
    expect(rowsForTab(rows, 'uyari').map((r) => r.title)).toEqual([
      'Zeytin sineği mücadele uyarısı',
    ]);
    expect(rowsForTab(rows, 'rehber').map((r) => r.title)).toEqual(['Çiftçi eğitimi: budama']);
    expect(rowsForTab(rows, 'hepsi')).toHaveLength(4);
    // Her satırın kaynağı ve tarihi vardır (kural 6).
    for (const r of rows) expect(r.source).toMatch(/Müdürlüğü · 2026-11-10/);
  });

  it('başvuru son günü olan haber Faaliyet Zamanı sekmesinde "Son başvuru günü" satırı olur; geçmiş son gün yazılmaz', () => {
    const rows = buildHomeRows(
      girdi([
        haber({
          id: 'a',
          category: 'yonlendirme',
          title: 'Fidan desteği',
          applyUntil: '2026-11-30',
        }),
        haber({ id: 'b', category: 'yonlendirme', title: 'Eski destek', applyUntil: '2026-11-01' }),
        haber({ id: 'c', category: 'yonlendirme', title: 'Bugün biten', applyUntil: '2026-11-15' }),
      ]),
    );
    const zaman = rowsForTab(rows, 'zaman');
    expect(zaman.map((r) => [r.date, r.title])).toEqual([
      ['2026-11-15', 'Son başvuru günü: Bugün biten'],
      ['2026-11-30', 'Son başvuru günü: Fidan desteği'],
    ]);
    // Son gün satırı "Hepsi"nde haberin kopyası olarak yinelenmez.
    expect(rowsForTab(rows, 'hepsi').filter((r) => r.title.includes('Fidan'))).toHaveLength(1);
    expect(rowsForTab(rows, 'hibe')).toHaveLength(3);
  });

  it('onay aşaması açıkken taslak ve otomatik olmayan duyuru hiçbir sekmeye girmez', () => {
    const rows = buildHomeRows(
      girdi([haber({ id: 't', needsBadge: true, auto: false, category: 'yonlendirme' })]),
    );
    expect(rows).toEqual([]);
  });

  it('boş sekme metni çiftçiye "onay bekliyor" demez; taramanın sürdüğünü söyler', () => {
    for (const s of ['zaman', 'rehber', 'uyari', 'hibe', 'hepsi'] as const) {
      expect(emptyText(s)).not.toMatch(/onay/i);
      expect(emptyText(s).length).toBeGreaterThan(20);
    }
    expect(emptyText('hibe')).toMatch(/günde 5 kez/);
  });
});
