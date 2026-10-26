import { describe, expect, it } from 'vitest';
import { groupCrops } from './cropGroups';

const crops = [
  { id: 'zeytin', nameTr: 'Zeytin', group: 'meyve-agaci', commonRank: 2 },
  { id: 'kiraz', nameTr: 'Elma, kiraz, armut', group: 'meyve-agaci', commonRank: null },
  { id: 'bugday', nameTr: 'Buğday', group: 'tahil', commonRank: 3 },
  { id: 'domates', nameTr: 'Domates', group: 'sebze', commonRank: 5 },
  { id: 'cay', nameTr: 'Çay', group: 'endustri', commonRank: null },
];

describe('ürün seçici gruplama (G23.10)', () => {
  it('bütün ürünler gruplu: meyve, sebze, tahıl, endüstri sırasıyla', () => {
    expect(groupCrops(crops, '').map((g) => g.group)).toEqual([
      'meyve-agaci',
      'sebze',
      'tahil',
      'endustri',
    ]);
  });
  it('arama Türkçe harfe duyarsız ve ad içinde arar ("kiraz", "cay", "BUGDAY")', () => {
    expect(groupCrops(crops, 'kiraz')[0]!.items.map((c) => c.id)).toEqual(['kiraz']);
    expect(groupCrops(crops, 'cay')[0]!.items.map((c) => c.id)).toEqual(['cay']);
    expect(groupCrops(crops, 'BUGDAY')[0]!.items.map((c) => c.id)).toEqual(['bugday']);
    expect(groupCrops(crops, 'yok')).toEqual([]);
  });
});
