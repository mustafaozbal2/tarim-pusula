import { describe, expect, it } from 'vitest';
import {
  categoryNames,
  exportFileName,
  exportText,
  shareStatusText,
  type ShareDto,
} from './wallet/model';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const share = (over: Partial<ShareDto> = {}): ShareDto => ({
  id: 's',
  ownerId: 'o',
  recipientId: 'r',
  categories: ['fields'],
  purpose: 'Kooperatif',
  createdAt: '2026-10-01T00:00:00Z',
  expiresAt: '2026-10-25T12:00:00Z',
  revokedAt: null,
  active: true,
  ...over,
});

describe('veri cüzdanı modeli', () => {
  it('paylaşım durumu: açık gün sayısı, bugün biter, süresi doldu, geri alındı', () => {
    expect(shareStatusText(share(), NOW)).toBe('5 gün daha açık');
    expect(shareStatusText(share({ expiresAt: '2026-10-20T18:00:00Z' }), NOW)).toBe(
      'Son gün: bugün bitiyor',
    );
    expect(shareStatusText(share({ expiresAt: '2026-10-20T11:59:00Z' }), NOW)).toBe('Süresi doldu');
    expect(shareStatusText(share({ revokedAt: '2026-10-10T00:00:00Z' }), NOW)).toBe('Geri alındı');
  });
  it('dosya adı UTC gününden, metin okunaklı JSON', () => {
    expect(exportFileName(new Date('2026-10-20T23:59:00Z'))).toBe(
      'tarim-pusula-verilerim-2026-10-20.json',
    );
    expect(JSON.parse(exportText({ a: [1] }))).toEqual({ a: [1] });
    expect(exportText({ a: 1 })).toContain('\n');
  });
  it('kategori adları çiftçi dilinde; bilinmeyen anahtar olduğu gibi', () => {
    const all = [{ key: 'fields', label: 'Tarlalarım', count: 2 }];
    expect(categoryNames(['fields', 'x'], all)).toBe('Tarlalarım, x');
  });
});
