import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Veritabanında duran sırların (TOTP, cihaz sırrı) AES-256-GCM ile şifrelenmesi.
 * Biçim: `v1:<iv>:<etiket>:<şifreli>` (base64url). Anahtar yalnız .env'den gelir (SECRET_ENC_KEY, 64 hane hex).
 * Önek taşımayan değer eski düz metin kayıttır; okunur, bir sonraki yazımda şifrelenir.
 */
export function encKeyFrom(env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env['SECRET_ENC_KEY'];
  if (hex) {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('SECRET_ENC_KEY 64 haneli hex olmalı');
    return Buffer.from(hex, 'hex');
  }
  if (env['NODE_ENV'] === 'production') throw new Error('Üretimde SECRET_ENC_KEY zorunlu');
  // Yalnız geliştirme: sabit bir anahtardan türetilir. Üretimde kullanılmaz (yukarıdaki hata).
  return scryptSync('gelistirme-icin-sabit-anahtar', 'tarim-pusula-secretbox', 32);
}

export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const b = (x: Buffer) => x.toString('base64url');
  return `v1:${b(iv)}:${b(c.getAuthTag())}:${b(ct)}`;
}

export const isSealed = (v: string) => v.startsWith('v1:');

export function open(key: Buffer, stored: string): string {
  if (!isSealed(stored)) return stored;
  const [, iv, tag, ct] = stored.split(':');
  if (!iv || !tag || !ct) throw new Error('bozuk şifreli değer');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
