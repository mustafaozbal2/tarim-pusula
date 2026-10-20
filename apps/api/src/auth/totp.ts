import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 4648 base32 (dolgusuz, büyük harf). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('geçersiz base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const TOTP_PERIOD = 30;

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 6238 / RFC 4226: HMAC-SHA1, dinamik kesme, `digits` hane. */
export function hotp(secret: Buffer, counter: number, digits = 6, algo = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algo, secret).update(msg).digest();
  const off = h[h.length - 1]! & 0xf;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const totpStep = (at: Date) => Math.floor(at.getTime() / 1000 / TOTP_PERIOD);

/**
 * Kodu ±1 adım (±30 sn) toleransla doğrular. `afterStep` verilirse o adım ve öncesi reddedilir
 * (aynı kodun tekrar kullanılması engellenir). Eşleşen adımı döner, yoksa null.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  at: Date,
  afterStep = 0,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const now = totpStep(at);
  let matched: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    const given = Buffer.from(code);
    // Sabit süreli karşılaştırma; ilk eşleşmeyi tut, döngüyü erken bitirme.
    if (timingSafeEqual(expected, given) && step > afterStep && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri(secretB32: string, account: string): string {
  const label = encodeURIComponent(`Tarım Pusula:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent('Tarım Pusula')}&period=${TOTP_PERIOD}&digits=6`;
}
