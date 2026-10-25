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
