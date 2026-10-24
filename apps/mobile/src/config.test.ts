import { describe, expect, it } from 'vitest';
import { normalizeApiUrl, resolveApiUrl } from './config';

describe('sunucu adresi', () => {
  it('boş, bozuk ya da http dışı adres null döner (uygulama çökmez)', () => {
    expect(normalizeApiUrl(undefined)).toBeNull();
    expect(normalizeApiUrl('')).toBeNull();
    expect(normalizeApiUrl('   ')).toBeNull();
    expect(normalizeApiUrl('bilgisayarim')).toBeNull();
    expect(normalizeApiUrl('ftp://192.168.1.5')).toBeNull();
  });
  it('sondaki eğik çizgi atılır, kapı korunur', () => {
    expect(normalizeApiUrl(' http://192.168.1.20:8200/ ')).toBe('http://192.168.1.20:8200');
    expect(normalizeApiUrl('https://api.ornek.com/v1/')).toBe('https://api.ornek.com/v1');
  });
  it('cihazda kayıtlı adres derleme adresinden önceliklidir', () => {
    expect(resolveApiUrl('http://10.0.0.2:8200', 'http://x.com')).toBe('http://10.0.0.2:8200');
    expect(resolveApiUrl(null, 'http://192.168.1.20:8200')).toBe('http://192.168.1.20:8200');
    expect(resolveApiUrl('bozuk', 'http://192.168.1.20:8200')).toBe('http://192.168.1.20:8200');
    expect(resolveApiUrl(null, undefined)).toBeNull();
  });
});
