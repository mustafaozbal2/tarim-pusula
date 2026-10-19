import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@tarim/schemas';
import { systemTx, type Db, type Principal } from '../db/db';
import type { SmsProvider } from './sms';

export const DB = Symbol('DB');
export const SMS = Symbol('SMS');
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  /** OTP özetleme anahtarı (.env: OTP_SECRET). */
  otpSecret: string;
  /** Bu numaralar ilk girişte admin rolü de alır (.env: ADMIN_PHONES, virgülle). */
  adminPhones: string[];
  now: () => Date;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpMaxRequests: number;
  otpRequestWindowSeconds: number;
  sessionTtlSeconds: number;
}

export const defaultAuthConfig = (env: NodeJS.ProcessEnv = process.env): AuthConfig => ({
  otpSecret: env['OTP_SECRET'] ?? 'gelistirme-icin-sabit-anahtar',
  adminPhones: (env['ADMIN_PHONES'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  now: () => new Date(),
  otpTtlSeconds: 300,
  otpMaxAttempts: 5,
  otpMaxRequests: 5,
  otpRequestWindowSeconds: 600,
  sessionTtlSeconds: 30 * 24 * 3600,
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SMS) private readonly sms: SmsProvider,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  private codeHash(phone: string, code: string): string {
    return createHmac('sha256', this.cfg.otpSecret).update(`${phone}:${code}`).digest('hex');
  }

  /** Numaraya 6 haneli kod gönderir. Numaranın kayıtlı olup olmadığını sızdırmaz. */
  async requestOtp(phone: string): Promise<{ expiresInSeconds: number }> {
    const now = this.cfg.now();
    const since = new Date(now.getTime() - this.cfg.otpRequestWindowSeconds * 1000);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await systemTx(this.db, async (q) => {
      const [row] = await q.query<{ n: string }>(
        'SELECT count(*)::text n FROM otp_codes WHERE phone = $1 AND created_at > $2',
        [phone, since],
      );
      if (Number(row!.n) >= this.cfg.otpMaxRequests) {
        throw new HttpException('Çok fazla deneme. Biraz bekleyip tekrar deneyin.', 429);
      }
      await q.query(
        'INSERT INTO otp_codes(phone, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)',
        [
          phone,
          this.codeHash(phone, code),
          new Date(now.getTime() + this.cfg.otpTtlSeconds * 1000),
          now,
        ],
      );
    });
    await this.sms.send(phone, `Tarım Pusula giriş kodunuz: ${code}`);
    return { expiresInSeconds: this.cfg.otpTtlSeconds };
  }

  /** Kodu doğrular; kullanıcı yoksa oluşturur (farmer rolüyle); oturum jetonu döner. */
  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ token: string; userId: string; isNewUser: boolean }> {
    const now = this.cfg.now();
    const fail = () => new UnauthorizedException('Kod yanlış ya da süresi dolmuş');
    // Deneme sayacı, hata olsa bile kalıcı olmalı: doğrulama ve sayaç ayrı işlemler.
    const otp = await systemTx(this.db, async (q) => {
      const [row] = await q.query<{ id: string; code_hash: string; attempts: number }>(
        `SELECT id, code_hash, attempts FROM otp_codes
         WHERE phone = $1 AND consumed_at IS NULL AND expires_at > $2
         ORDER BY created_at DESC LIMIT 1`,
        [phone, now],
      );
      if (!row || row.attempts >= this.cfg.otpMaxAttempts) return null;
      await q.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      return row;
    });
    if (!otp) throw fail();
    const a = Buffer.from(this.codeHash(phone, code));
    const b = Buffer.from(otp.code_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail();

    const token = randomBytes(32).toString('base64url');
    return systemTx(this.db, async (q) => {
      const consumed = await q.query(
        'UPDATE otp_codes SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL RETURNING id',
        [otp.id, now],
      );
      if (consumed.length === 0) throw fail();
      let isNewUser = false;
      let [user] = await q.query<{ id: string }>('SELECT id FROM users WHERE phone = $1', [phone]);
      if (!user) {
        isNewUser = true;
        [user] = await q.query<{ id: string }>(
          'INSERT INTO users(phone) VALUES ($1) RETURNING id',
          [phone],
        );
        await q.query("INSERT INTO user_roles(user_id, role) VALUES ($1, 'farmer')", [user!.id]);
      }
      if (this.cfg.adminPhones.includes(phone)) {
        await q.query(
          "INSERT INTO user_roles(user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING",
          [user!.id],
        );
      }
      await q.query(
        'INSERT INTO sessions(user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)',
        [user!.id, sha256(token), new Date(now.getTime() + this.cfg.sessionTtlSeconds * 1000), now],
      );
      await q.query('SELECT set_config($1, $2, true)', ['app.user_id', user!.id]);
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'auth.login',
        'sessions',
        user!.id,
        JSON.stringify({ newUser: isNewUser }),
      ]);
      return { token, userId: user!.id, isNewUser };
    });
  }

  /** Jetondan kullanıcıyı ve rollerini çözer; geçersizse null. */
  async authenticate(token: string): Promise<Principal | null> {
    const now = this.cfg.now();
    return systemTx(this.db, async (q) => {
      const [s] = await q.query<{ user_id: string }>(
        `SELECT user_id FROM sessions
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
        [sha256(token), now],
      );
      if (!s) return null;
      const roles = await q.query<{ role: Role }>(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [s.user_id],
      );
      return { userId: s.user_id, roles: roles.map((r) => r.role) };
    });
  }

  async logout(token: string, userId: string): Promise<void> {
    await systemTx(this.db, async (q) => {
      await q.query('UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1', [
        sha256(token),
        this.cfg.now(),
      ]);
      await q.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'auth.logout',
        'sessions',
        userId,
        '{}',
      ]);
    });
  }
}
