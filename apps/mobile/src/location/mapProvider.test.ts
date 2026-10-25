import { describe, expect, it } from 'vitest';
import { DEFAULT_TILE_URL, resolveBasemap } from './mapProvider';

describe('altlık sağlayıcı seçimi', () => {
  it('bayrak yoksa varsayılan EOX', () => {
    const b = resolveBasemap({});
    expect(b.id).toBe('eox');
    expect(b.tileUrl).toBe(DEFAULT_TILE_URL);
    expect(b.fallback).toBe(false);
  });
  it('Esri seçilince anahtarsız kullanılır ve atıf içerir', () => {
    const b = resolveBasemap({ EXPO_PUBLIC_MAP_PROVIDER: 'esri' });
    expect(b.id).toBe('esri');
    expect(b.tileUrl).toContain('World_Imagery');
    expect(b.attribution).toMatch(/Esri/);
  });
  it('MapTiler anahtar yoksa EOX altlığında kalır', () => {
    const b = resolveBasemap({ EXPO_PUBLIC_MAP_PROVIDER: 'maptiler' });
    expect(b.id).toBe('eox');
    expect(b.fallback).toBe(true);
    expect(b.tileUrl).not.toContain('undefined');
  });
  it('MapTiler anahtarla seçilir', () => {
    const b = resolveBasemap({
      EXPO_PUBLIC_MAP_PROVIDER: 'maptiler',
      EXPO_PUBLIC_MAPTILER_KEY: 'k123',
    });
    expect(b.id).toBe('maptiler');
    expect(b.tileUrl).toContain('key=k123');
  });
  it('Mapbox anahtarsız geri düşer, anahtarla seçilir', () => {
    expect(resolveBasemap({ EXPO_PUBLIC_MAP_PROVIDER: 'mapbox' }).fallback).toBe(true);
    const b = resolveBasemap({
      EXPO_PUBLIC_MAP_PROVIDER: 'mapbox',
      EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.x',
    });
    expect(b.id).toBe('mapbox');
    expect(b.tileUrl).toContain('access_token=pk.x');
  });
  it('bilinmeyen değer varsayılana düşer; açık TILE_URL en öncelikli', () => {
    expect(resolveBasemap({ EXPO_PUBLIC_MAP_PROVIDER: 'x' }).id).toBe('eox');
    const b = resolveBasemap({ EXPO_PUBLIC_TILE_URL: 'https://t/{z}/{x}/{y}.png' });
    expect(b.id).toBe('ozel');
  });
});

describe('parsel verisi', () => {
  it('kaynakta TKGM çağrısı yok', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..');
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/test\.ts$/.test(e.name))
          if (/tkgm\.gov\.tr|parselsorgu|megsis/i.test(readFileSync(p, 'utf8'))) bad.push(p);
      }
    };
    walk(dir);
    expect(bad).toEqual([]);
  });
});
