import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, verifyTotp } from './totp';

// RFC 4226 Ek D: gizli "12345678901234567890", sayaç 0..9.
const RFC4226 = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
];
const SECRET = Buffer.from('12345678901234567890');

describe('TOTP (RFC 4226 / 6238)', () => {
  it('RFC 4226 Ek D HOTP değerlerini üretir', () => {
    RFC4226.forEach((v, i) => expect(hotp(SECRET, i)).toBe(v));
  });

  it('RFC 6238 Ek B SHA-1 vektörleri (8 hane): t=59, 1111111109, 2000000000', () => {
    const at = (t: number) => Math.floor(t / 30);
    expect(hotp(SECRET, at(59), 8)).toBe('94287082');
    expect(hotp(SECRET, at(1111111109), 8)).toBe('07081804');
    expect(hotp(SECRET, at(2000000000), 8)).toBe('69279037');
  });

  it('base32 gidiş-dönüş', () => {
    expect(base32Encode(SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(SECRET)).toBe(true);
  });

  it('±1 adım toleransı; aynı adım ikinci kez kabul edilmez', () => {
    const b32 = base32Encode(SECRET);
    const t = new Date(1111111109 * 1000);
    const step = Math.floor(1111111109 / 30);
    const code = hotp(SECRET, step);
    expect(verifyTotp(b32, code, t)).toBe(step);
    expect(verifyTotp(b32, code, new Date(t.getTime() + 30_000))).toBe(step); // bir adım sonra hâlâ tolerans içinde
    expect(verifyTotp(b32, code, new Date(t.getTime() + 90_000))).toBeNull();
    expect(verifyTotp(b32, code, t, step)).toBeNull(); // tekrar kullanım
    expect(verifyTotp(b32, '12345', t)).toBeNull();
  });
});
