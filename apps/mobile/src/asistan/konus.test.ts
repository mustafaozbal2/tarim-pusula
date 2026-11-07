import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn(),
  getAvailableVoicesAsync: vi.fn(async () => []),
}));

import { enIyiSes, okunacakMetin } from './konus';

describe('robot sesi', () => {
  it('okunacak metinden işaretler ve bağlantılar temizlenir', () => {
    expect(okunacakMetin('Arazilerin:\n• Bağ (Efeler)\n• Zeytin https://x.com/a')).toBe(
      'Arazilerin: Bağ (Efeler). Zeytin',
    );
    expect(okunacakMetin('  ')).toBe('');
    expect(okunacakMetin('a'.repeat(900)).length).toBe(600);
  });
  it('en iyi Türkçe ses seçilir (Enhanced > ağ > diğer); Türkçe yoksa undefined', () => {
    const v = [
      { identifier: 'en-us-x-1', language: 'en-US', quality: 'Enhanced' },
      { identifier: 'tr-tr-x-a-local', language: 'tr-TR', quality: 'Default' },
      { identifier: 'tr-tr-x-b-network', language: 'tr-TR', quality: 'Default' },
      { identifier: 'tr-tr-x-c-local', language: 'tr-TR', quality: 'Enhanced' },
    ];
    expect(enIyiSes(v)).toBe('tr-tr-x-c-local');
    expect(enIyiSes(v.slice(0, 1))).toBeUndefined();
    expect(enIyiSes(v.filter((x) => !x.identifier.includes('c-local')))).toBe('tr-tr-x-b-network');
  });
});
