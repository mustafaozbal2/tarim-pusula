import { describe, expect, it } from 'vitest';
import { hourOf, parseThresholdPercent } from './prefsInput';
import { getCksProvider } from '@tarim/devices';

describe('hatırlatıcı giriş yardımcıları', () => {
  it('nem eşiği yüzdeden orana; boş ve sınır dışı otomatik (null)', () => {
    expect(parseThresholdPercent('25')).toBeCloseTo(0.25);
    expect(parseThresholdPercent('22,5')).toBeCloseTo(0.225);
    expect(parseThresholdPercent('')).toBeNull();
    expect(parseThresholdPercent('0')).toBeNull();
    expect(parseThresholdPercent('100')).toBeNull();
    expect(parseThresholdPercent('abc')).toBeNull();
  });
  it('saat 0-23 dışında önceki değere döner', () => {
    expect(hourOf('0', 7)).toBe(0);
    expect(hourOf('23', 7)).toBe(23);
    expect(hourOf('24', 7)).toBe(7);
    expect(hourOf('-1', 7)).toBe(7);
    expect(hourOf('', 7)).toBe(7);
    expect(hourOf('6.5', 7)).toBe(7);
  });
  it('ÇKS: sahte sağlayıcı dürüst metin verir, parsel uydurmaz', async () => {
    const p = getCksProvider();
    const st = await p.status();
    expect(st.message).toBe('Resmi bağlantı onaylandığında açılır.');
    expect(st.live).toBe(false);
    expect(await p.listParcels()).toEqual([]);
  });
});
