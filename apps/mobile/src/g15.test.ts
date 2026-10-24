import { describe, expect, it } from 'vitest';
import { NetworkError, type CalendarDto, type CalendarEventDto, type FieldDto } from './api/client';
import { loadCalendar } from './calendar/load';
import { dayText, eventSource, groupEvents, rangeText } from './calendar/model';
import { announcementSource } from './today/announcementText';
import { MemoryKV } from './offline/kv';
import { createTokenStore } from './offline/tokenStore';

const field: FieldDto = {
  id: 'f1',
  name: 'Fıstık bahçesi',
  province: 'Gaziantep',
  district: null,
  village: null,
  lat: 37,
  lon: 37,
  areaDecare: 20,
  cropId: 'antep-fistigi',
  locationSource: 'gps',
  clientId: null,
};

const ev = (over: Partial<CalendarEventDto> = {}): CalendarEventDto => ({
  templateId: 't1',
  title: 'Budama',
  detail: 'Kış budaması',
  stage: null,
  start: '2026-11-01',
  end: '2026-11-20',
  ongoing: false,
  needsBadge: true,
  actionable: false,
  source: 'GTHB Rehberi',
  sourceVersion: '2024',
  sourceDate: '2024-05-01',
  why: 'Ürünün antep fıstığı olduğu için.',
  ...over,
});

const cal = (events: CalendarEventDto[]): CalendarDto => ({
  fieldId: 'f1',
  today: '2026-10-24',
  days: 90,
  cropId: 'antep-fistigi',
  events,
  note: null,
});

describe('takvim modeli', () => {
  it('tarih metni çiftçi dilinde, aralık ve tek gün', () => {
    expect(dayText('2026-03-12')).toBe('12 Mart');
    expect(dayText('2026-12-01')).toBe('1 Aralık');
    expect(rangeText({ start: '2026-03-12', end: '2026-04-20' })).toBe('12 Mart - 20 Nisan');
    expect(rangeText({ start: '2026-03-12', end: '2026-03-12' })).toBe('12 Mart');
  });

  it('şimdi ve yaklaşan ayrılır, başlangıca göre sıralanır', () => {
    const g = groupEvents([
      ev({ templateId: 'c', start: '2026-12-01', end: '2026-12-02' }),
      ev({ templateId: 'a', ongoing: true, start: '2026-10-20', end: '2026-10-30' }),
      ev({ templateId: 'b', start: '2026-11-01' }),
    ]);
    expect(g.now.map((e) => e.templateId)).toEqual(['a']);
    expect(g.soon.map((e) => e.templateId)).toEqual(['b', 'c']);
  });

  it('kaynak satırı kurum + sürüm + tarih içerir', () => {
    expect(eventSource(ev())).toBe('GTHB Rehberi · 2024 · 2024-05-01');
  });
});

describe('takvim yükleme', () => {
  it('internet varken getirir ve önbelleğe yazar; yokken önbellekten gösterir', async () => {
    const kv = new MemoryKV();
    let online = true;
    const api = {
      fields: async () => {
        if (!online) throw new NetworkError();
        return [field];
      },
      calendar: async () => {
        if (!online) throw new NetworkError();
        return cal([ev()]);
      },
    };
    const first = await loadCalendar(api, kv);
    expect(first?.offline).toBe(false);
    expect(first?.data.events).toHaveLength(1);

    online = false;
    const second = await loadCalendar(api, kv);
    expect(second?.offline).toBe(true);
    expect(second?.data.events[0]?.title).toBe('Budama');
    expect(second?.at).toBe(first?.at);
  });

  it('tarla yoksa null; hiç önbellek yoksa hata', async () => {
    const none = { fields: async () => [], calendar: async () => cal([]) };
    expect(await loadCalendar(none, new MemoryKV())).toBeNull();
    const down = {
      fields: async () => [field],
      calendar: async () => {
        throw new NetworkError();
      },
    };
    await expect(loadCalendar(down, new MemoryKV())).rejects.toThrow();
  });
});

describe('duyuru kartı kaynak satırı', () => {
  it('kurum ve yayın tarihi (gün.ay.yıl) görünür', () => {
    const s = announcementSource({
      sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
      publishedAt: '2026-03-05T09:00:00Z',
    });
    expect(s).toContain('Kaynak: Gaziantep İl Tarım ve Orman Müdürlüğü');
    expect(s).toContain('Yayın:');
    expect(s).toMatch(/5\.0?3\.2026/);
  });
});

describe('oturum jetonu deposu', () => {
  const KEY = 'session.token';

  it('jeton güvenli depoya yazılır, düz depoda kalmaz', async () => {
    const secure = new MemoryKV();
    const legacy = new MemoryKV();
    const store = createTokenStore(secure, legacy, KEY);
    await legacy.set(KEY, 'eski');
    await store.set('yeni');
    expect(await secure.get(KEY)).toBe('yeni');
    expect(await legacy.get(KEY)).toBeNull();
    expect(await store.get()).toBe('yeni');
  });

  it('eski sürümden düz depodaki jeton ilk okumada taşınır', async () => {
    const secure = new MemoryKV();
    const legacy = new MemoryKV();
    await legacy.set(KEY, 'eski-jeton');
    const store = createTokenStore(secure, legacy, KEY);
    expect(await store.get()).toBe('eski-jeton');
    expect(await secure.get(KEY)).toBe('eski-jeton');
    expect(await legacy.get(KEY)).toBeNull();
  });

  it('çıkışta ikisinden de silinir; jeton yoksa null', async () => {
    const secure = new MemoryKV();
    const legacy = new MemoryKV();
    const store = createTokenStore(secure, legacy, KEY);
    expect(await store.get()).toBeNull();
    await secure.set(KEY, 'a');
    await legacy.set(KEY, 'b');
    await store.clear();
    expect(await secure.get(KEY)).toBeNull();
    expect(await legacy.get(KEY)).toBeNull();
  });

  it('web (aynı depo) jetonu silmez', async () => {
    const same = new MemoryKV();
    const store = createTokenStore(same, same, KEY);
    await store.set('jeton');
    expect(await store.get()).toBe('jeton');
  });
});
