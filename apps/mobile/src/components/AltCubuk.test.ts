import { describe, expect, it } from 'vitest';
import { ALT_SEKMELER, altCubukGorunur } from './altCubukYol';

describe('alt çubuk', () => {
  it('ana sayfalarda görünür; sohbet, form ve giriş ekranlarında görünmez', () => {
    for (const y of ['/', '/index', '/takvim', '/pazar', '/hava', '/haber', '/bildirimler'])
      expect(altCubukGorunur(y), y).toBe(true);
    for (const y of ['/yapay-zeka', '/giris', '/ayarlar', '/arazi-ekle', '/yetkili', '/sulama'])
      expect(altCubukGorunur(y), y).toBe(false);
  });
  it('dört düğme: ana sayfa, takvim, yapay zekâ, pazar', () => {
    expect(ALT_SEKMELER.map((s) => s.rota)).toEqual(['/', '/takvim', '/yapay-zeka', '/pazar']);
    expect(ALT_SEKMELER.find((s) => s.eslesen.test('/takvim'))?.key).toBe('takvim');
    expect(ALT_SEKMELER.find((s) => s.eslesen.test('/'))?.key).toBe('ana');
  });
});
