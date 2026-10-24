import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Role } from '@tarim/schemas';
import { systemTx, type Db, type Principal } from '../db/db';
import type { SmsProvider } from './sms';
import { encKeyFrom, isSealed, open, seal } from './secretbox';
import { newTotpSecret, otpauthUri, totpStep, verifyTotp } from './totp';

/** Panele girebilen roller. */
export const STAFF_ROLES = ['institution_admin', 'expert', 'admin'] as const;

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
  /** Veritabanındaki sırların şifre anahtarı (.env: SECRET_ENC_KEY). */
  encKey: Buffer;
  /** YALNIZ demo modu: SMS ve doğrulayıcı kodu yerine geçen sabit kod. Üretimde asla verilmez. */
  demoCode?: string;
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
  encKey: encKeyFrom(env),
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
    const code = this.cfg.demoCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
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
      const [s] = await q.query<{ user_id: string; mfa_at: Date | null }>(
        `SELECT user_id, mfa_at FROM sessions
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
        [sha256(token), now],
      );
      if (!s) return null;
      const roles = await q.query<{ role: Role }>(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [s.user_id],
      );
      return { userId: s.user_id, roles: roles.map((r) => r.role), mfa: s.mfa_at !== null };
    });
  }

  /** İkinci adım yalnız panel rolleri için (kurum yöneticisi, uzman, yönetici). */
  private assertStaff(p: Principal) {
    if (!p.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
  }

  /** Doğrulayıcı uygulama (TOTP) kaydı başlatır. Onaylanmış kayıt varsa yeniden başlatılamaz. */
  async mfaEnroll(p: Principal, phone?: string): Promise<{ secret: string; otpauthUri: string }> {
    this.assertStaff(p);
    return systemTx(this.db, async (q) => {
      const [cur] = await q.query<{ confirmed_at: Date | null }>(
        'SELECT confirmed_at FROM user_mfa WHERE user_id = $1',
        [p.userId],
      );
      if (cur?.confirmed_at) throw new ConflictException('İkinci adım zaten kurulu');
      const secret = newTotpSecret();
      await q.query(
        `INSERT INTO user_mfa(user_id, secret) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, last_step = 0`,
        [p.userId, seal(this.cfg.encKey, secret)],
      );
      await q.query('SELECT set_config($1, $2, true)', ['app.user_id', p.userId]);
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'auth.mfa.enroll',
        'user_mfa',
        p.userId,
        '{}',
      ]);
      return { secret, otpauthUri: otpauthUri(secret, phone ?? p.userId) };
    });
  }

  async mfaStatus(p: Principal): Promise<{ enrolled: boolean; verified: boolean }> {
    this.assertStaff(p);
    const [row] = await systemTx(this.db, (q) =>
      q.query<{ confirmed_at: Date | null }>(
        'SELECT confirmed_at FROM user_mfa WHERE user_id = $1',
        [p.userId],
      ),
    );
    return { enrolled: !!row?.confirmed_at, verified: p.mfa === true };
  }

  /** Kodu doğrular; ilk başarıda kaydı onaylar, oturuma `mfa_at` yazar. 5 hatadan sonra 5 dk kilit. */
  async mfaVerify(p: Principal, token: string, code: string): Promise<void> {
    this.assertStaff(p);
    const now = this.cfg.now();
    const fail = () => new UnauthorizedException('Kod yanlış ya da süresi dolmuş');
    const ok = await systemTx(this.db, async (q) => {
      const [m] = await q.query<{
        secret: string;
        last_step: string;
        failures: number;
        locked_until: Date | null;
      }>(
        'SELECT secret, last_step, failures, locked_until FROM user_mfa WHERE user_id = $1 FOR UPDATE',
        [p.userId],
      );
      if (!m) throw new ConflictException('Önce doğrulayıcı uygulamayı kurun');
      if (m.locked_until && m.locked_until > now) {
        throw new HttpException('Çok fazla deneme. Biraz bekleyip tekrar deneyin.', 429);
      }
      // Demo modunda sabit kod kabul edilir; adım yine ilerler (aynı adım tekrar kullanılamaz).
      const step =
        this.cfg.demoCode && code === this.cfg.demoCode
          ? Math.max(Number(m.last_step) + 1, totpStep(now))
          : verifyTotp(open(this.cfg.encKey, m.secret), code, now, Number(m.last_step));
      await q.query('SELECT set_config($1, $2, true)', ['app.user_id', p.userId]);
      if (step === null) {
        const failures = m.failures + 1;
        await q.query('UPDATE user_mfa SET failures = $2, locked_until = $3 WHERE user_id = $1', [
          p.userId,
          failures >= 5 ? 0 : failures,
          failures >= 5 ? new Date(now.getTime() + 300_000) : null,
        ]);
        await q.query('SELECT write_audit($1, $2, $3, $4)', [
          'auth.mfa.fail',
          'sessions',
          p.userId,
          '{}',
        ]);
        return false;
      }
      await q.query(
        `UPDATE user_mfa SET last_step = $2, failures = 0, locked_until = NULL,
           confirmed_at = coalesce(confirmed_at, $3) WHERE user_id = $1`,
        [p.userId, step, now],
      );
      // Eski düz metin kayıt ilk başarılı girişte şifrelenir.
      if (!isSealed(m.secret)) {
        await q.query('UPDATE user_mfa SET secret = $2 WHERE user_id = $1', [
          p.userId,
          seal(this.cfg.encKey, m.secret),
        ]);
      }
      await q.query('UPDATE sessions SET mfa_at = $2 WHERE token_hash = $1', [sha256(token), now]);
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'auth.mfa.ok',
        'sessions',
        p.userId,
        '{}',
      ]);
      return true;
    });
    if (!ok) throw fail();
  }

  /**
   * Yönetici, başka bir personelin ikinci adımını sıfırlar (telefon kaybı). Kayıt silinir, hedefin
   * oturumları ikinci adımı kaybeder; kişi yeniden kurulum yapar. Kendi kaydını sıfırlayamaz.
   */
  async mfaReset(admin: Principal, targetUserId: string): Promise<void> {
    if (admin.userId === targetUserId) {
      throw new ConflictException('Kendi ikinci adımınızı sıfırlayamazsınız');
    }
    await systemTx(this.db, async (q) => {
      const rows = await q.query('DELETE FROM user_mfa WHERE user_id = $1 RETURNING user_id', [
        targetUserId,
      ]);
      if (!rows.length) throw new NotFoundException('Bu kişinin kurulu ikinci adımı yok');
      await q.query('UPDATE sessions SET mfa_at = NULL WHERE user_id = $1', [targetUserId]);
      await q.query('SELECT set_config($1, $2, true)', ['app.user_id', admin.userId]);
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'auth.mfa.reset',
        'user_mfa',
        targetUserId,
        '{}',
      ]);
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
