import { describe, expect, it } from 'vitest';
import { groupNotifications, notificationLook } from './view';

const item = (id: string, date: string) => ({
  id,
  date,
  title: id,
  tone: 'normal' as const,
  key: id,
});

describe('bildirim görünümü (G23.14)', () => {
  it('Bugün / Bu hafta / Daha önce gruplanır, boş grup çıkmaz, yeniden eskiye sıralı', () => {
    const g = groupNotifications(
      [
        item('a', '2026-10-26T08:00:00Z'),
        item('b', '2026-10-24T08:00:00Z'),
        item('c', '2026-10-25T08:00:00Z'),
        item('d', '2026-09-01T08:00:00Z'),
      ],
      '2026-10-26',
    );
    expect(g.map((x) => x.title)).toEqual(['Bugün', 'Bu hafta', 'Daha önce']);
    expect(g[1]!.items.map((i) => i.id)).toEqual(['c', 'b']);
    expect(groupNotifications([item('a', '2026-10-26')], '2026-10-26')).toHaveLength(1);
  });
  it('tür ikonu: don uyarı, su damla, duyuru kitap', () => {
    expect(notificationLook('don', 'warning').icon).toBe('warning');
    expect(notificationLook('su', 'normal').icon).toBe('drop');
    expect(notificationLook('duyuru-1', 'normal').kind).toBe('duyuru');
    expect(notificationLook('hava', 'normal').icon).toBe('sun');
  });
});
