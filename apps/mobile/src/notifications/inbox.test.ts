import { describe, expect, it } from 'vitest';
import { notificationItems, unreadCount } from './state';
import { notificationLook } from './view';

describe('G24 sunucu bildirim kutusu', () => {
  it('uzman cevabı bildirim listesine girer, okunmamış sayılır ve uzman ikonuyla görünür', () => {
    const items = notificationItems(
      null,
      [],
      [
        {
          id: 'n1',
          kind: 'uzman_cevap',
          title: 'Sorunuz cevaplandı',
          body: 'Cevap',
          refId: 'q1',
          createdAt: '2026-11-01T10:00:00Z',
          readAt: null,
        },
      ],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('uzman-n1');
    expect(unreadCount(items, [])).toBe(1);
    expect(unreadCount(items, [items[0]!.key])).toBe(0);
    expect(notificationLook(items[0]!.id, 'normal').icon).toBe('people');
  });
});
