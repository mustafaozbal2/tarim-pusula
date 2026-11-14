import { describe, expect, it } from 'vitest';
import { ALT_SEKMELER, altCubukGorunur } from './altCubukYol';

describe('alt çubuk', () => {
  it('ana sayfalarda görünür; sohbet, form ve giriş ekranlarında görünmez', () => {
    for (const y of [
      '/',
      '/index',
      '/takvim',
      '/ikiz-tarim',
      '/pazar',
      '/hava',
      '/haber',
      '/bildirimler',
    ])
      expect(altCubukGorunur(y), y).toBe(true);
    for (const y of ['/yapay-zeka', '/giris', '/ayarlar', '/arazi-ekle', '/yetkili', '/sulama'])
      expect(altCubukGorunur(y), y).toBe(false);
  });
  it('beş düğme, yapay zekâ ortada', () => {
    expect(ALT_SEKMELER.map((s) => s.rota)).toEqual([
      '/',
      '/ikiz-tarim',
      '/yapay-zeka',
      '/hava',
      '/pazar',
    ]);
    expect(ALT_SEKMELER[2]?.key).toBe('yz');
    expect(ALT_SEKMELER.find((s) => s.eslesen.test('/ikiz-tarim'))?.key).toBe('ikiz');
    expect(ALT_SEKMELER.find((s) => s.eslesen.test('/'))?.key).toBe('ana');
  });
});
