import { describe, expect, it } from 'vitest';
import type { AnnouncementDto } from './api/client';
import { MemoryKV } from './offline/kv';
import { loadAnnouncements } from './today/announcements';

const a: AnnouncementDto = {
  id: '1',
  sourceOrg: 'İl Müdürlüğü',
  title: 'Toplantı',
  body: 'Yarın.',
  sourceUrl: null,
  publishedAt: '2026-10-19T00:00:00Z',
  needsBadge: true,
  why: 'Gaziantep için',
};

describe('duyuru yükleme', () => {
  it('sunucudan alır ve önbelleğe yazar; sunucu yoksa önbellekten verir', async () => {
    const kv = new MemoryKV();
    const ok = { announcements: async () => ({ announcements: [a] }) };
    expect(await loadAnnouncements(ok, kv, 'f1')).toEqual([a]);
    const down = {
      announcements: async () => {
        throw new Error('ağ yok');
      },
    };
    expect(await loadAnnouncements(down, kv, 'f1')).toEqual([a]);
    expect(await loadAnnouncements(down, kv, 'baska')).toEqual([]);
  });
});
