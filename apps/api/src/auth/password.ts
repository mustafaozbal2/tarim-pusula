import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/**
 * Şifre özeti: scrypt (N=2^15, r=8, p=1, 64 bayt), rastgele 16 bayt tuz. Biçim:
 * `scrypt$N$r$p$tuz(base64)$özet(base64)`. Parametreler özetin içinde saklanır; ileride artırılabilir.
 */
const N = 32768;
const R = 8;
const P = 1;
const LEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFC'), salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Sabit zamanlı karşılaştırma; bozuk ya da boş özet her zaman false. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash!, 'base64');
  const key = await scrypt(
    password.normalize('NFC'),
    Buffer.from(salt!, 'base64'),
    Number(n),
    Number(r),
    Number(p),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}
