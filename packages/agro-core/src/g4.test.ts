import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonth,
  explainMatch,
  fieldCalendar,
  foldTr,
  haversineKm,
  isActive,
  matchesCrop,
  matchesField,
  matchesPlace,
  occurrences,
  type CalendarTemplate,
} from './index';

const gaziantepFistik = {
  province: 'Gaziantep',
  district: 'Nizip',
  village: 'Burç',
  lat: 37.0,
  lon: 37.8,
  cropId: 'antep-fistigi',
};

describe('haversineKm', () => {
  it('bilinen uzaklıklar: aynı nokta 0; 1° enlem ≈ 111,19 km; İstanbul–Ankara ≈ 350 km', () => {
    expect(haversineKm(40, 30, 40, 30)).toBe(0);
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
    const d = haversineKm(41.0082, 28.9784, 39.9334, 32.8597);
    expect(d).toBeGreaterThan(345);
    expect(d).toBeLessThan(355);
  });
});

describe('yer hedefleme', () => {
  it('hedefsiz duyuru ulusaldır', () => {
    expect(matchesPlace({}, gaziantepFistik)).toBe(true);
    expect(matchesPlace({ places: [] }, {})).toBe(true);
  });

  it('il eşleşir; Türkçe harf ve büyük/küçük harf duyarsız', () => {
    expect(matchesPlace({ places: [{ province: 'GAZİANTEP' }] }, gaziantepFistik)).toBe(true);
    expect(matchesPlace({ places: [{ province: 'gaziantep' }] }, gaziantepFistik)).toBe(true);
    expect(foldTr('ŞANLIURFA')).toBe('sanliurfa');
  });

  it('başka ilin duyurusu eşleşmez', () => {
    expect(matchesPlace({ places: [{ province: 'Şanlıurfa' }] }, gaziantepFistik)).toBe(false);
    expect(matchesField({ places: [{ province: 'Mersin' }] }, gaziantepFistik)).toBe(false);
  });

  it('aynı adlı ilçe başka ilde eşleşmez', () => {
    const f = { ...gaziantepFistik, province: 'Gaziantep', district: 'Merkez' };
    expect(matchesPlace({ places: [{ province: 'Hatay', district: 'Merkez' }] }, f)).toBe(false);
    expect(matchesPlace({ places: [{ province: 'Gaziantep', district: 'Merkez' }] }, f)).toBe(true);
  });

  it('ilçe ve köy daraltır', () => {
    expect(
      matchesPlace({ places: [{ province: 'Gaziantep', district: 'Araban' }] }, gaziantepFistik),
    ).toBe(false);
    expect(
      matchesPlace(
        { places: [{ province: 'Gaziantep', district: 'Nizip', village: 'Burç' }] },
        gaziantepFistik,
      ),
    ).toBe(true);
    expect(
      matchesPlace(
        { places: [{ province: 'Gaziantep', district: 'Nizip', village: 'Başka' }] },
        gaziantepFistik,
      ),
    ).toBe(false);
  });

  it('köy yazılıp ilçe yazılmamışsa güvenli tarafta kalır: eşleşmez', () => {
    expect(
      matchesPlace({ places: [{ province: 'Gaziantep', village: 'Burç' }] }, gaziantepFistik),
    ).toBe(false);
  });

  it('tarlanın ili bilinmiyorsa il hedefli duyuru görünmez', () => {
    expect(matchesPlace({ places: [{ province: 'Gaziantep' }] }, { cropId: 'x' })).toBe(false);
  });

  it('daire: içindeki nokta eşleşir, dışındaki eşleşmez; il bilinmese de çalışır', () => {
    const circle = { lat: 37.0, lon: 37.8, radiusKm: 10 };
    expect(matchesPlace({ circle }, { lat: 37.05, lon: 37.8 })).toBe(true);
    expect(matchesPlace({ circle }, { lat: 37.2, lon: 37.8 })).toBe(false);
    expect(matchesPlace({ circle }, {})).toBe(false);
  });

  it('il ve daire birlikte VEYA ile çalışır', () => {
    const t = {
      places: [{ province: 'Mersin' }],
      circle: { lat: 37.0, lon: 37.8, radiusKm: 5 },
    };
    expect(matchesPlace(t, gaziantepFistik)).toBe(true);
    expect(matchesPlace(t, { province: 'Hatay', lat: 36.2, lon: 36.1 })).toBe(false);
  });
});

describe('ürün hedefleme', () => {
  it('boş liste tüm ürünler', () => {
    expect(matchesCrop({}, { cropId: 'zeytin' })).toBe(true);
    expect(matchesCrop({ cropIds: [] }, {})).toBe(true);
  });
  it('liste dolu: yalnız listedeki ürün; ürünü olmayan tarla görmez', () => {
    const t = { cropIds: ['antep-fistigi', 'zeytin'] };
    expect(matchesCrop(t, { cropId: 'zeytin' })).toBe(true);
    expect(matchesCrop(t, { cropId: 'pamuk' })).toBe(false);
    expect(matchesCrop(t, { cropId: null })).toBe(false);
  });
  it('yer ve ürün birlikte VE ile çalışır', () => {
    const t = { places: [{ province: 'Gaziantep' }], cropIds: ['pamuk'] };
    expect(matchesField(t, gaziantepFistik)).toBe(false);
    expect(matchesField(t, { ...gaziantepFistik, cropId: 'pamuk' })).toBe(true);
  });
});

describe('yayın süresi', () => {
  const now = new Date('2026-10-20T09:00:00Z');
  it('yayın öncesi, süresi bitmiş ve süresiz', () => {
    expect(isActive({ publishedAt: '2026-10-21T00:00:00Z' }, now)).toBe(false);
    expect(
      isActive({ publishedAt: '2026-10-19T00:00:00Z', expiresAt: '2026-10-20T09:00:00Z' }, now),
    ).toBe(false);
    expect(
      isActive({ publishedAt: '2026-10-19T00:00:00Z', expiresAt: '2026-10-21T00:00:00Z' }, now),
    ).toBe(true);
    expect(isActive({ publishedAt: '2026-10-19T00:00:00Z', expiresAt: null }, now)).toBe(true);
  });
});

describe('explainMatch', () => {
  it('neden gösterildiğini düz Türkçe söyler', () => {
    expect(explainMatch({}, gaziantepFistik)).toContain('tüm ülke');
    const s = explainMatch(
      { places: [{ province: 'Gaziantep', district: 'Nizip' }], cropIds: ['antep-fistigi'] },
      gaziantepFistik,
    );
    expect(s).toContain('Gaziantep / Nizip');
    expect(s).toContain('ürününüz');
  });
});

describe('takvim pencereleri', () => {
  it('ay uzunluğu ve gün ekleme', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('yıl aşan pencere (15 Aralık – 15 Ocak)', () => {
    const w = { startMonth: 12, startDay: 15, endMonth: 1, endDay: 15 };
    expect(occurrences(w, '2027-01-05', '2027-01-20')).toEqual([
      { start: '2026-12-15', end: '2027-01-15' },
    ]);
    expect(occurrences(w, '2027-02-01', '2027-03-01')).toEqual([]);
  });
  it('31 Şubat ayın sonuna kırpılır', () => {
    const w = { startMonth: 2, startDay: 31, endMonth: 3, endDay: 10 };
    expect(occurrences(w, '2027-02-01', '2027-02-28')[0]!.start).toBe('2027-02-28');
  });
});

const tpl = (over: Partial<CalendarTemplate> = {}): CalendarTemplate => ({
  id: 't1',
  cropId: 'antep-fistigi',
  title: 'Deneme etkinliği',
  detail: 'Ayrıntı',
  stage: 'Çiçeklenme',
  startMonth: 10,
  startDay: 25,
  endMonth: 11,
  endDay: 10,
  reviewStatus: 'taslak-uzman-onayi-bekliyor',
  source: 'Test kaynağı',
  sourceVersion: 'v1',
  sourceDate: '2026-10-01',
  ...over,
});

describe('fieldCalendar', () => {
  it('ürüne göre süzer, tarihe göre sıralar, kaynak taşır', () => {
    const ev = fieldCalendar(
      gaziantepFistik,
      [
        tpl({ id: 'b', title: 'B', startMonth: 11, startDay: 5, endMonth: 11, endDay: 6 }),
        tpl({ id: 'a' }),
        tpl({ id: 'x', cropId: 'pamuk' }),
      ],
      '2026-10-20',
      30,
    );
    expect(ev.map((e) => e.templateId)).toEqual(['a', 'b']);
    expect(ev[0]).toMatchObject({
      start: '2026-10-25',
      end: '2026-11-10',
      ongoing: false,
      source: 'Test kaynağı',
      sourceDate: '2026-10-01',
    });
    expect(ev[0]!.why).toContain('Test kaynağı');
  });
  it('taslak şablon rozetli ve eyleme dönük değil; onaylı olan eyleme dönük', () => {
    const [d] = fieldCalendar(gaziantepFistik, [tpl()], '2026-10-20');
    expect(d).toMatchObject({ needsBadge: true, actionable: false });
    const [a] = fieldCalendar(
      gaziantepFistik,
      [tpl({ reviewStatus: 'uzman-onayli' })],
      '2026-10-20',
    );
    expect(a).toMatchObject({ needsBadge: false, actionable: true });
  });
  it('sürmekte olan etkinlik ongoing', () => {
    const [e] = fieldCalendar(gaziantepFistik, [tpl()], '2026-11-01');
    expect(e!.ongoing).toBe(true);
  });
  it('başka ilin şablonu görünmez; ürünsüz tarlada takvim boş', () => {
    const t = tpl({ places: [{ province: 'Mersin' }] });
    expect(fieldCalendar(gaziantepFistik, [t], '2026-10-20')).toEqual([]);
    expect(fieldCalendar({ ...gaziantepFistik, cropId: null }, [tpl()], '2026-10-20')).toEqual([]);
  });
  it('pencere dışı etkinlik gelmez', () => {
    expect(fieldCalendar(gaziantepFistik, [tpl()], '2026-10-20', 3)).toEqual([]);
  });
});
