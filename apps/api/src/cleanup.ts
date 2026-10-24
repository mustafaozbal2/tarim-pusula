import {
  Controller,
  HttpCode,
  Inject,
  Injectable,
  Post,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Roles } from './auth/access';
import { DataService } from './data.service';
import { CLOCK } from './weather/tokens';

/** Saklama süreleri (KVKK veri minimizasyonu): süresi geçen kayıt gereğinden uzun tutulmaz. */
export const OTP_KEEP_HOURS = 24;
export const SESSION_KEEP_DAYS = 7;

export interface CleanupResult {
  otpDeleted: number;
  sessionsDeleted: number;
}

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  onModuleInit(): void {
    // Varsayılan saatlik; CLEANUP_INTERVAL_MIN=0 kapatır.
    const raw = process.env['CLEANUP_INTERVAL_MIN'];
    const minutes = raw === undefined || raw === '' ? 60 : Number(raw);
    if (Number.isFinite(minutes) && minutes > 0) {
      this.timer = setInterval(() => void this.run().catch(console.error), minutes * 60_000);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Doğrulanmış/süresi dolmuş OTP'leri (1 gün sonra) ve süresi dolmuş ya da iptal edilmiş oturumları
   * (7 gün sonra) siler. Denetim kaydına dokunmaz (değiştirilemez); silinen satır sayısı kayda geçer.
   */
  async run(): Promise<CleanupResult> {
    const now = this.now();
    const otpBefore = new Date(now.getTime() - OTP_KEEP_HOURS * 3600_000);
    const sessBefore = new Date(now.getTime() - SESSION_KEEP_DAYS * 86_400_000);
    return this.data.system(async (q) => {
      const otp = await q.query(
        'DELETE FROM otp_codes WHERE expires_at < $1 OR consumed_at < $1 RETURNING id',
        [otpBefore],
      );
      const ses = await q.query(
        'DELETE FROM sessions WHERE expires_at < $1 OR revoked_at < $1 RETURNING id',
        [sessBefore],
      );
      await q.query('SELECT write_audit($1, $2, $3, $4::jsonb)', [
        'system.cleanup',
        'otp_codes',
        null,
        JSON.stringify({ otp: otp.length, sessions: ses.length }),
      ]);
      return { otpDeleted: otp.length, sessionsDeleted: ses.length };
    });
  }
}

@Controller('admin/jobs')
@Roles('admin')
export class CleanupController {
  constructor(@Inject(CleanupService) private readonly cleanup: CleanupService) {}

  /** Temizliği elle başlatır (zamanlayıcı CLEANUP_INTERVAL_MIN ile de çalışır). */
  @Post('cleanup')
  @HttpCode(200)
  run() {
    return this.cleanup.run();
  }
}
