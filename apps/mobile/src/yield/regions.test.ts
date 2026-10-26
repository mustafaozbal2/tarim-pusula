import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foldProvince, perDecare, regionOf, REGIONS, WHEAT_YIELD } from './regions';

const cropIds = new Set(
  readFileSync(resolve(__dirname, '../../../../data/crops_tr.csv'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(',')[0]),
);
const provinces = new Set(
  readFileSync(resolve(__dirname, '../../../../data/yerlesim.csv'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => foldProvince(l.split(',')[0]!)),
);

describe('Verim Haritası bölge verisi (G23.11)', () => {
  it('81 il, her il tek bölgede, adlar yerleşim verisindeki il adlarıyla aynı', () => {
    const all = Object.values(REGIONS).flatMap((r) => r.provinces);
    expect(all).toHaveLength(81);
    expect(new Set(all).size).toBe(81);
    for (const p of all) expect(provinces.has(foldProvince(p)), p).toBe(true);
  });
  it('bölge ürünleri ürün listesinde var', () => {
    for (const r of Object.values(REGIONS))
      for (const c of r.crops) expect(cropIds.has(c), c).toBe(true);
  });
  it('il -> bölge: Gaziantep Güneydoğu, Isparta Akdeniz, İzmir Ege; harf duyarsız; bilinmeyen null', () => {
    expect(regionOf('Gaziantep')).toBe('guneydogu');
    expect(regionOf('ISPARTA')).toBe('akdeniz');
    expect(regionOf('izmir')).toBe('ege');
    expect(regionOf('Atlantis')).toBeNull();
    expect(regionOf(null)).toBeNull();
  });
  it('TÜİK buğday verimi: Türkiye AB ortalamasının yaklaşık yarısı; kg/da dönüşümü', () => {
    const tr = WHEAT_YIELD.rows.find((r) => r.label === 'Türkiye')!.kgPerHa;
    const ab = WHEAT_YIELD.rows.find((r) => r.label === 'AB ortalaması')!.kgPerHa;
    expect(tr / ab).toBeCloseTo(0.4997, 3);
    expect(perDecare(2669.5)).toBeCloseTo(266.95, 2);
  });
});
