import { describe, expect, it } from 'vitest';
import { fiyatDegisimi, gunTr, kalanGun } from './view';

describe('haftalık özet metinleri', () => {
  it('tarih ve kalan gün', () => {
    expect(gunTr('2026-11-28')).toBe('28.11.2026');
    expect(kalanGun('2026-11-24', '2026-11-24')).toBe('bugün');
    expect(kalanGun('2026-11-25', '2026-11-24')).toBe('yarın');
    expect(kalanGun('2026-12-04', '2026-11-24')).toBe('10 gün sonra');
  });
  it('fiyat değişimi yönü ve Türkçe ondalık', () => {
    expect(fiyatDegisimi(4.2)).toEqual({ metin: '%4,2 arttı', yon: 'artis' });
    expect(fiyatDegisimi(-3)).toEqual({ metin: '%3 düştü', yon: 'dusus' });
    expect(fiyatDegisimi(0).yon).toBe('sabit');
  });
});
