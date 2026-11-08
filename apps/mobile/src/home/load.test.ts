import { describe, expect, it } from 'vitest';
import type { FieldDto, TodayDto } from '../api/client';
import { MemoryKV } from '../offline/kv';
import { loadHome } from './load';

const field: FieldDto = {
  id: 'f1',
  name: 'Kiraz Bahçesi',
  province: 'Isparta',
  district: 'Merkez',
  village: null,
  lat: 37.7,
  lon: 30.5,
  areaDecare: 10,
  cropId: 'kiraz',
  locationSource: 'gps',
  clientId: null,
};

const today = { fieldId: 'f1', generatedAt: '2026-10-25T08:00:00Z' } as unknown as TodayDto;

function api(over: Record<string, unknown> = {}) {
  return {
    fields: async () => [field],
    today: async () => today,
    calendar: async () => ({
      fieldId: 'f1',
      today: '2026-10-25',
      days: 90,
      cropId: 'kiraz',
      events: [],
      note: null,
    }),
    supports: async () => ({ matches: [], today: '2026-10-25' }),
    announcements: async () => ({ announcements: [] }),
    ...over,
  };
}

describe('loadHome', () => {
  it('arazi yoksa null', async () => {
    const r = await loadHome(api({ fields: async () => [] }) as never, new MemoryKV());
    expect(r).toBeNull();
  });

  it('yan veri hatası ana sayfayı düşürmez (boş liste)', async () => {
    const boom = async () => {
      throw new Error('x');
    };
    const r = await loadHome(
      api({ calendar: boom, supports: boom, announcements: boom }) as never,
      new MemoryKV(),
    );
    expect(r?.base.field.id).toBe('f1');
    expect(r?.calendar).toBeNull();
    expect(r?.supports).toEqual([]);
    expect(r?.announcements).toEqual([]);
  });

  it('çevrimdışıyken son takvim önbellekten gelir', async () => {
    const kv = new MemoryKV();
    await loadHome(api() as never, kv);
    const r = await loadHome(
      api({
        calendar: async () => {
          throw new Error('offline');
        },
      }) as never,
      kv,
    );
    expect(r?.calendar?.cropId).toBe('kiraz');
  });
});

describe('loadHomeCache (TP-T1: soğuk açılışta anında göster)', () => {
  it('önbellek yoksa null (iskelet); varsa son bilinen veriyi ağsız verir', async () => {
    const { MemoryKV } = await import('../offline/kv');
    const { loadHomeCache } = await import('./load');
    const kv = new MemoryKV();
    expect(await loadHomeCache(kv)).toBeNull();
    const f = { id: 'f1', name: 'Bağ', lat: 37, lon: 37, cropId: 'zeytin' };
    await kv.set('cache.fields.v1', JSON.stringify({ at: 'x', fields: [f] }));
    expect(await loadHomeCache(kv)).toBeNull(); // hava önbelleği yoksa yine iskelet
    await kv.set(
      'cache.today.v1.f1',
      JSON.stringify({ at: '2026-11-08T05:00:00Z', today: { fieldId: 'f1' } }),
    );
    await kv.set('cache.announcements.v1.f1', JSON.stringify([{ id: 'a1', title: 'D' }]));
    const r = await loadHomeCache(kv);
    expect(r!.base.field.id).toBe('f1');
    expect(r!.base.offline).toBe(false);
    expect(r!.announcements).toHaveLength(1);
    expect(r!.calendar).toBeNull();
  });
});
