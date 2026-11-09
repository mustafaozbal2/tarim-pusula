import { describe, expect, it } from 'vitest';
import type { AnnouncementDto, CalendarEventDto, SupportMatchDto, TodayDto } from '../api/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrnekIcerikDto } from '../api/client';
import {
  addDays,
  attentionCount,
  buildHomeRows,
  dateBox,
  emptyText,
  fitFontSize,
  homeCards,
  nextCardIndex,
  placeLine,
  rowsForTab,
  havaUyariSatirlari,
} from './model';

const ornek = (id: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../../../../data/ornek_icerik/${id}.json`), 'utf8'),
  ) as OrnekIcerikDto;

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
  source: 'GTHB',
  sourceVersion: 'v1',
  sourceDate: '2026-01-01',
  why: 'Ürün evresine göre.',
  ...over,
});

const frost = (level: 'none' | 'watch' | 'warning' | 'pending') =>
  ({
    generatedAt: '2026-10-25T08:00:00Z',
    frost: {
      assessment:
        level === 'pending'
          ? { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: true }
          : {
              kind: 'frost',
              level,
              probability: 0.6,
              members: 40,
              thresholdC: -2,
              medianMinC: -3,
              minMemberC: -4,
            },
      date: '2026-10-26',
      dayOffset: 1,
      stageName: 'Çiçeklenme',
      unavailable: false,
      source: 'Open-Meteo',
      fetchedAt: '2026-10-25T07:00:00Z',
    },
  }) as unknown as TodayDto;

const support = (over: Partial<SupportMatchDto> = {}): SupportMatchDto => ({
  support: {
    id: 's1',
    title: 'Bireysel sulama sistemlerine %50 hibe desteği',
    summary: 'Kırsal kalkınma desteği.',
    applyFrom: '2026-01-25',
    applyTo: '2026-12-31',
    source: 'TKDK',
    sourceDate: '2026-01-01',
    sourceVersion: 'v1',
  },
  why: ['ilinizde geçerli'],
  badge: false,
  status: 'acik',
  ...over,
});

const ann = (over: Partial<AnnouncementDto> = {}): AnnouncementDto => ({
  id: 'a1',
  sourceOrg: 'İl Müdürlüğü',
  title: 'Sulama toplantısı',
  body: 'Cuma günü.',
  sourceUrl: null,
  publishedAt: '2026-10-20T09:00:00Z',
  needsBadge: false,
  why: 'İlinize uyar',
  ...over,
});

const calendar = (events: CalendarEventDto[]) => ({
  fieldId: 'f',
  today: '2026-10-25',
  days: 90,
  cropId: 'kiraz',
  events,
  note: null,
});

describe('dateBox', () => {
  it('ay / gün / yıl üç satır', () => {
    expect(dateBox('2022-01-25')).toEqual({ month: 'Ocak', day: '25', year: '2022' });
    expect(dateBox('2022-05-03T10:00:00Z')).toEqual({ month: 'Mayıs', day: '3', year: '2022' });
    expect(dateBox('2022-06-10')).toEqual({ month: 'Haziran', day: '10', year: '2022' });
  });
});

describe('buildHomeRows', () => {
  it('onaysız takvim işi, taslak destek ve onaysız duyuru hiç satır olmaz', () => {
    const rows = buildHomeRows({
      calendar: calendar([ev({ needsBadge: true })]),
      today: frost('pending'),
      supports: [support({ badge: true, status: 'onay-bekliyor' })],
      announcements: [ann({ needsBadge: true })],
    });
    expect(rows).toEqual([]);
  });

  it('onaysız eşikte erken uyarı üretilmez; Dikkat sayısı 0', () => {
    const rows = buildHomeRows({
      calendar: null,
      today: frost('pending'),
      supports: [],
      announcements: [],
    });
    expect(rows.some((r) => r.kind === 'uyari')).toBe(false);
    expect(attentionCount(rows)).toBe(0);
  });

  it('onaylı don uyarısı Erken Uyarılar sekmesine ve Dikkat rozetine düşer', () => {
    const rows = buildHomeRows({
      calendar: null,
      today: frost('warning'),
      supports: [],
      announcements: [],
    });
    expect(rowsForTab(rows, 'uyari')).toHaveLength(1);
    expect(attentionCount(rows)).toBe(1);
    expect(rows[0]?.source).toContain('Open-Meteo');
  });

  it('"ihtimal" (watch) da aktif ve onaylı uyarıdır', () => {
    const rows = buildHomeRows({
      calendar: null,
      today: frost('watch'),
      supports: [],
      announcements: [],
    });
    expect(attentionCount(rows)).toBe(1);
  });

  it('don beklenmiyorsa uyarı yok', () => {
    const rows = buildHomeRows({
      calendar: null,
      today: frost('none'),
      supports: [],
      announcements: [],
    });
    expect(attentionCount(rows)).toBe(0);
  });

  it('sekmeler ayrı; Hepsi rehberi tekrarlamaz; tarihe göre sıralı', () => {
    const rows = buildHomeRows({
      calendar: calendar([
        ev(),
        ev({ templateId: 'gub', title: 'Gübreleme', start: '2026-10-30', end: '2026-10-30' }),
      ]),
      today: null,
      supports: [support()],
      announcements: [ann()],
      todayIso: '2026-10-30',
    });
    expect(rowsForTab(rows, 'zaman')).toHaveLength(2);
    expect(rowsForTab(rows, 'rehber')).toHaveLength(2);
    expect(rowsForTab(rows, 'hibe')).toHaveLength(1);
    const all = rowsForTab(rows, 'hepsi');
    expect(all.some((r) => r.kind === 'rehber')).toBe(false);
    expect(all).toHaveLength(4);
    // Bugün ve sonrası yakından uzağa; geçmiş en yeniden eskiye ve sonda.
    const today = '2026-10-30';
    const dates = all.map((r) => r.date);
    const next = dates.filter((d) => d >= today);
    const past = dates.filter((d) => d < today);
    expect(dates).toEqual([...next, ...past]);
    expect(next).toEqual([...next].sort());
    expect(past).toEqual([...past].sort().reverse());
  });

  it('her satırda kaynak etiketi vardır', () => {
    const rows = buildHomeRows({
      calendar: calendar([ev()]),
      today: frost('warning'),
      supports: [support()],
      announcements: [ann()],
    });
    for (const r of rows) expect(r.source.length, r.id).toBeGreaterThan(5);
  });

  it('kapalı dönemli destek gösterilmez; hiçbir satırda "onay bekliyor" yazısı yok', () => {
    const rows = buildHomeRows({
      calendar: calendar([ev()]),
      today: frost('warning'),
      supports: [support({ status: 'kapali' }), support()],
      announcements: [ann()],
    });
    expect(rowsForTab(rows, 'hibe')).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/onayı bekl/i);
  });
});

describe('yardımcılar', () => {
  it('kayan şerit döngüsel ilerler; boş şeritte 0', () => {
    expect(nextCardIndex(0, 5)).toBe(1);
    expect(nextCardIndex(4, 5)).toBe(0);
    expect(nextCardIndex(2, 0)).toBe(0);
  });
  it('il, ilçe satırı', () => {
    expect(placeLine({ province: 'Isparta', district: 'Merkez', village: null })).toBe(
      'Isparta, Merkez',
    );
    expect(placeLine({ province: null, district: null, village: 'Burç' })).toBe('Burç');
  });
  it('boş durum metinleri dürüst ve her sekme için vardır', () => {
    for (const t of ['zaman', 'rehber', 'uyari', 'hibe', 'hepsi'] as const) {
      expect(emptyText(t).length).toBeGreaterThan(10);
    }
  });
});

describe('demo örnek içeriği (G22)', () => {
  const base = { calendar: null, today: null, supports: [], announcements: [] };
  it.each(['antep-fistigi', 'zeytin', 'domates'])(
    '%s: 5 kart, her sekmede 5 satır, Hepsi 20 satır',
    (id) => {
      const sample = ornek(id);
      const rows = buildHomeRows({ ...base, sample, todayIso: '2026-10-25' });
      for (const t of ['zaman', 'rehber', 'uyari', 'hibe'] as const) {
        expect(rowsForTab(rows, t)).toHaveLength(5);
      }
      expect(rowsForTab(rows, 'hepsi')).toHaveLength(20);
      expect(homeCards([], sample)).toHaveLength(5);
      for (const r of rows) expect(r.source).toContain('Örnek veri (demo)');
      // Örnek uyarılar Dikkat rozeti yakmaz (onaylı uyarı değildir).
      expect(attentionCount(rows)).toBe(0);
    },
  );
  it('ürün değişince içerik değişir', () => {
    const a = buildHomeRows({ ...base, sample: ornek('antep-fistigi'), todayIso: '2026-10-25' });
    const z = buildHomeRows({ ...base, sample: ornek('zeytin'), todayIso: '2026-10-25' });
    expect(a.map((r) => r.title)).not.toEqual(z.map((r) => r.title));
  });
  it('tarih demo gününe göre: kesin tarih iddiası yok', () => {
    const rows = buildHomeRows({ ...base, sample: ornek('zeytin'), todayIso: '2026-10-25' });
    const uyari = rowsForTab(rows, 'uyari');
    expect(uyari[0]!.date).toBe('2026-10-25');
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
  });
  it('gerçek onaylı kayıt önce gelir, örnek veri 5e tamamlar', () => {
    const rows = buildHomeRows({
      ...base,
      calendar: {
        fieldId: 'f',
        today: '2026-10-25',
        days: 90,
        cropId: 'zeytin',
        events: [ev()],
        note: null,
      },
      sample: ornek('zeytin'),
      todayIso: '2026-10-25',
    });
    const zaman = rowsForTab(rows, 'zaman');
    expect(zaman).toHaveLength(5);
    expect(zaman.filter((r) => !r.sample)).toHaveLength(1);
    // Takvimden gelen rehber satırı Hepsi'de tekrar etmez; örnek rehber satırları Hepsi'de vardır.
    const all = rowsForTab(rows, 'hepsi');
    expect(all.some((r) => r.kind === 'rehber' && !r.sample)).toBe(false);
    expect(all.filter((r) => r.kind === 'rehber')).toHaveLength(4);
  });
  it('örnek veri yoksa (gerçek mod) örnek satır ve kart üretilmez', () => {
    expect(buildHomeRows({ ...base, sample: null })).toHaveLength(0);
    expect(homeCards([], null)).toHaveLength(0);
  });
  it('duyuru + örnek kartta aynı görsel iki kez kullanılmaz', () => {
    const a = {
      id: 'a1',
      title: 'Duyuru',
      needsBadge: false,
      imageDataUrl: null,
    } as unknown as AnnouncementDto;
    const cards = homeCards([a], ornek('zeytin'));
    // G23: üst sınır 12; 1 duyuru + 5 örnek kart.
    expect(cards).toHaveLength(6);
    expect(new Set(cards.map((c) => c.image)).size).toBe(6);
    expect(cards[0]!.announcementId).toBe('a1');
  });
  it('şeritte en çok 12 kart (G23)', () => {
    const many = Array.from(
      { length: 15 },
      (_, i) =>
        ({
          id: `a${i}`,
          title: `D${i}`,
          needsBadge: false,
          imageDataUrl: null,
        }) as unknown as AnnouncementDto,
    );
    const cards = homeCards(many, ornek('zeytin'));
    expect(cards).toHaveLength(12);
    expect(new Set(cards.map((c) => c.image)).size).toBe(11);
    expect(cards.map((c) => c.image)).not.toContain('kart_10.jpg');
  });
  it('arazi adı yazı boyutu kutuya sığar (13-19 px)', () => {
    expect(fitFontSize('Kiraz Bahçesi', 185)).toBe(19);
    expect(fitFontSize('Burç Köyü Antep fıstığı', 185)).toBe(14);
    expect(fitFontSize('x'.repeat(80), 185)).toBe(13);
  });
  it('kart görseli hiçbir zaman boş değildir', () => {
    const s = ornek('zeytin');
    s.kartlar[0]!.gorsel = 'yok.jpg';
    for (const c of homeCards([], s)) expect(c.image).toMatch(/^kart_[1-5]\.jpg$/);
  });
});

describe('havaUyariSatirlari (MP-2): gerçek tahminden erken uyarı', () => {
  const gun = (date: string, tMaxC: number, precipMm: number | null) => ({
    date,
    tMinC: 10,
    tMaxC,
    precipMm,
  });
  const today = (days: ReturnType<typeof gun>[]) =>
    ({
      weather: { source: 'Open-Meteo', fetchedAt: '2026-11-08T05:00:00Z', days },
    }) as unknown as import('../api/client').TodayDto;

  it('eşik aşılırsa satır çıkar; kaynak ve tarih taşır; öneri/ilaç dili yok', () => {
    const r = havaUyariSatirlari(
      today([gun('2026-11-08', 20, 0), gun('2026-11-09', 39.4, 30), gun('2026-11-10', 37, 5)]),
      '2026-11-08',
    );
    expect(r.map((x) => x.id)).toEqual(['uyari-sicak-2026-11-09', 'uyari-yagis-2026-11-09']);
    expect(r[0]!.title).toBe('Yarın yüksek sıcaklık bekleniyor (39°)');
    expect(r[0]!.source).toBe('Open-Meteo · 2026-11-08');
    expect(JSON.stringify(r)).not.toMatch(/ilaç|dozu|ml\b/i);
  });
  it('sakin hava ve geçmiş/uzak günler için satır yok', () => {
    expect(havaUyariSatirlari(today([gun('2026-11-08', 22, 1)]), '2026-11-08')).toEqual([]);
    expect(havaUyariSatirlari(today([gun('2026-11-07', 40, 50)]), '2026-11-08')).toEqual([]);
  });
});

describe('birden çok arazi: seçili olmasa da tüm arazilerin işleri ve uyarıları görünür', () => {
  const olay = (templateId: string, title: string) =>
    ({
      templateId,
      title,
      detail: '',
      why: '',
      start: '2026-11-12',
      end: '2026-11-20',
      needsBadge: false,
      source: 'Kaynak',
      sourceVersion: 'v1',
      sourceDate: '2026-01-01',
    }) as unknown as CalendarEventDto;
  const cal = (...e: CalendarEventDto[]) => ({ events: e }) as never;
  it('diğer arazinin işi arazi adıyla gelir; aynı iş iki arazide tek satırda birleşir', () => {
    const rows = buildHomeRows({
      calendar: cal(olay('t1', 'Budama')),
      today: null,
      supports: [],
      announcements: [],
      todayIso: '2026-11-09',
      seciliAd: 'Ev',
      digerleri: [
        { ad: 'Tarlam', today: null, calendar: cal(olay('t1', 'Budama'), olay('t2', 'Hasat')) },
      ],
    });
    const z = rows.filter((r) => r.kind === 'zaman').map((r) => r.title);
    expect(z.some((t) => t.startsWith('Ev, Tarlam: Budama ('))).toBe(true);
    expect(z.filter((t) => t.includes('Budama'))).toHaveLength(1);
    expect(z.some((t) => t.startsWith('Tarlam: Hasat'))).toBe(true);
  });
  it('tek arazide ön ek yok', () => {
    const rows = buildHomeRows({
      calendar: cal(olay('t1', 'Budama')),
      today: null,
      supports: [],
      announcements: [],
      todayIso: '2026-11-09',
    });
    expect(rows[0]!.title.startsWith('Budama')).toBe(true);
  });
});
