import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  processNotification,
  type NotificationJob,
  type NotificationQueue,
  type ProcessorDeps,
  type PushClient,
} from '@tarim/workers';
import { pickPack, stagesOf } from '../controllers.g2';
import { DataService } from '../data.service';
import { frostCard, type FrostCard } from './today';
import type { WeatherProvider } from './openmeteo';
import { CLOCK, NOTIFY_QUEUE, PUSH, WEATHER } from './tokens';

export interface ScanResult {
  checked: number;
  queued: number;
  failed: number;
}

/** "Bu gece / bu sabah / 2 gün sonra" biçiminde çiftçi dili. */
export function frostWhen(card: Pick<FrostCard, 'dayOffset'>): string {
  const d = card.dayOffset ?? 0;
  return d === 0 ? 'bu sabah' : d === 1 ? 'bu gece' : `${d} gün sonra`;
}

@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private close: (() => Promise<void>) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(NOTIFY_QUEUE) private readonly queue: NotificationQueue,
    @Inject(PUSH) private readonly push: PushClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.close = await this.queue.process(async (job) => {
      await processNotification(job, this.deps());
    });
    const minutes = Number(process.env['FROST_SCAN_INTERVAL_MIN']);
    if (Number.isFinite(minutes) && minutes > 0) {
      this.timer = setInterval(() => void this.scanFrost().catch(console.error), minutes * 60_000);
      this.timer.unref?.();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.close?.();
  }

  private deps(): ProcessorDeps {
    return {
      push: this.push,
      queue: this.queue,
      now: this.now,
      tokensOf: (userId) =>
        this.data.system(async (q) =>
          (
            await q.query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [
              userId,
            ])
          ).map((r) => r.token),
        ),
      claim: (job) =>
        this.data.system(
          async (q) =>
            (
              await q.query(
                `INSERT INTO notification_log(dedupe_key, user_id, kind) VALUES ($1,$2,$3)
                 ON CONFLICT DO NOTHING RETURNING 1`,
                [job.dedupeKey, job.userId, job.kind],
              )
            ).length > 0,
        ),
      release: (job) =>
        this.data.system(async (q) => {
          await q.query('DELETE FROM notification_log WHERE dedupe_key = $1 AND user_id = $2', [
            job.dedupeKey,
            job.userId,
          ]);
        }),
      dropToken: (token) =>
        this.data.system(async (q) => {
          await q.query('DELETE FROM push_tokens WHERE token = $1', [token]);
        }),
    };
  }

  /**
   * Cihazı kayıtlı çiftçilerin ürünlü tarlalarında önümüzdeki 3 sabahın don olasılığına bakar;
   * olasılık ≥ %50 ve eşik uzman onaylıysa don bildirimi kuyruğa girer (tarla + gün başına bir kez).
   */
  async scanFrost(): Promise<ScanResult> {
    const fields = await this.data.system((q) =>
      q.query<{
        id: string;
        ownerId: string;
        name: string;
        lat: number;
        lon: number;
        cropId: string;
      }>(
        `SELECT f.id, f.owner_id AS "ownerId", f.name, f.lat, f.lon, f.crop_id AS "cropId"
         FROM fields f
         WHERE f.lat IS NOT NULL AND f.lon IS NOT NULL AND f.crop_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM push_tokens t WHERE t.user_id = f.owner_id)
         ORDER BY f.created_at`,
      ),
    );
    const res: ScanResult = { checked: 0, queued: 0, failed: 0 };
    for (const f of fields) {
      res.checked++;
      try {
        const bundle = await this.weather.get(f.lat, f.lon);
        const { pack, stages } = await this.data.system(async (q) => {
          const p = await pickPack(q, f.cropId);
          return { pack: p, stages: p ? await stagesOf(q, p.id) : [] };
        });
        const card = frostCard({
          field: { id: f.id, name: f.name, lat: f.lat, lon: f.lon, cropId: f.cropId },
          bundle,
          pack: pack
            ? {
                reviewStatus: pack.reviewStatus,
                kcMid: Number(pack.kcMid),
                version: pack.version,
                source: pack.source,
              }
            : null,
          stages,
          now: this.now(),
        });
        const a = card.assessment;
        if (a.kind !== 'frost' || a.level !== 'warning' || !card.date) continue;
        const job: NotificationJob = {
          kind: 'frost',
          userId: f.ownerId,
          title: 'Don uyarısı',
          body: `${f.name}: ${frostWhen(card)} don bekleniyor. Ne yapacağını görmek için uygulamayı aç.`,
          dedupeKey: `frost:${f.id}:${card.date}`,
          data: { fieldId: f.id, date: card.date },
        };
        await this.queue.enqueue(job);
        res.queued++;
      } catch {
        res.failed++; // bir tarlanın hatası diğerlerini durdurmaz
      }
    }
    return res;
  }
}
