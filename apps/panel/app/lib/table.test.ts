import { describe, expect, it } from 'vitest';
import { distinct, EMPTY_QUERY, nextSort, queryTable, type Row } from './table';

const rows: Row[] = [
  { id: 'a', ad: 'Isırgan otu', il: 'Gaziantep', alan: 12 },
  { id: 'b', ad: 'Zeytin', il: 'Aydın', alan: 100 },
  { id: 'c', ad: 'İncir', il: 'Aydın', alan: 9 },
  { id: 'd', ad: 'Pamuk', il: 'Şanlıurfa', alan: 55 },
  { id: 'e', ad: 'Buğday', il: 'Şanlıurfa', alan: null },
];
const q = (over: Partial<typeof EMPTY_QUERY> = {}) => ({ ...EMPTY_QUERY, ...over });
const ids = (r: { rows: Row[] }) => r.rows.map((x) => x['id']);

describe('liste mantığı', () => {
  it('arama Türkçe büyük/küçük harf duyarsızdır (I/ı, İ/i)', () => {
    expect(ids(queryTable(rows, ['ad'], q({ search: 'ISIR' })))).toEqual(['a']);
    expect(ids(queryTable(rows, ['ad'], q({ search: 'inc' })))).toEqual(['c']);
    expect(ids(queryTable(rows, ['ad'], q({ search: 'İNC' })))).toEqual(['c']);
    expect(queryTable(rows, ['ad'], q({ search: 'yok' })).total).toBe(0);
  });

  it('filtre: "Tümü" (boş) hepsini getirir; seçilen değer yalnız eşleşeni', () => {
    expect(queryTable(rows, ['ad'], q({ filters: { il: '' } })).total).toBe(5);
    expect(ids(queryTable(rows, ['ad'], q({ filters: { il: 'Aydın' } })))).toEqual(['b', 'c']);
  });

  it('arama ve filtre birlikte', () => {
    expect(ids(queryTable(rows, ['ad'], q({ search: 'z', filters: { il: 'Aydın' } })))).toEqual([
      'b',
    ]);
  });

  it('sıralama: sayısal ve Türkçe alfabetik (ı < i, ş < t), azalan yön', () => {
    expect(ids(queryTable(rows, ['ad'], q({ sortKey: 'alan' })))).toEqual([
      'e',
      'c',
      'a',
      'd',
      'b',
    ]);
    expect(ids(queryTable(rows, ['ad'], q({ sortKey: 'alan', sortDir: 'desc' })))).toEqual([
      'b',
      'd',
      'a',
      'c',
      'e',
    ]);
    // Türkçe: Buğday, Isırgan otu, İncir, Pamuk, Zeytin
    expect(ids(queryTable(rows, ['ad'], q({ sortKey: 'ad' })))).toEqual(['e', 'a', 'c', 'd', 'b']);
  });

  it('sayfalama: sayfa boyutu, toplam, sayfa sayısı, aralık dışı sayfa sıkıştırılır', () => {
    const r = queryTable(rows, ['ad'], q({ pageSize: 2, page: 2 }));
    expect(ids(r)).toEqual(['c', 'd']);
    expect(r).toMatchObject({ total: 5, page: 2, pageCount: 3 });
    expect(queryTable(rows, ['ad'], q({ pageSize: 2, page: 99 })).page).toBe(3);
    expect(queryTable(rows, ['ad'], q({ pageSize: 2, page: -4 })).page).toBe(1);
    const empty = queryTable([], ['ad'], q());
    expect(empty).toMatchObject({ total: 0, page: 1, pageCount: 1 });
  });

  it('sütun başlığı: aynı sütun yön değiştirir, yeni sütun artan başlar', () => {
    expect(nextSort({ sortKey: null, sortDir: 'asc' }, 'ad')).toEqual({
      sortKey: 'ad',
      sortDir: 'asc',
    });
    expect(nextSort({ sortKey: 'ad', sortDir: 'asc' }, 'ad')).toEqual({
      sortKey: 'ad',
      sortDir: 'desc',
    });
    expect(nextSort({ sortKey: 'ad', sortDir: 'desc' }, 'il')).toEqual({
      sortKey: 'il',
      sortDir: 'asc',
    });
  });

  it('filtre seçenekleri benzersiz ve Türkçe sıralı', () => {
    expect(distinct(rows, 'il')).toEqual(['Aydın', 'Gaziantep', 'Şanlıurfa']);
  });
});
