import { decideDelivery, type NotificationKind } from './quietHours';
import type { PushClient } from './push';

export interface NotificationJob {
  kind: NotificationKind;
  userId: string;
  title: string;
  body: string;
  /** Aynı olay için tek bildirim: ör. `frost:<tarla>:<tarih>`. */
  dedupeKey: string;
  data?: Record<string, unknown>;
}

/** Kuyruk soyutlaması: üretimde BullMQ (Redis), geliştirmede/testte bellekte. */
export interface NotificationQueue {
  enqueue(job: NotificationJob, opts?: { delayMs?: number }): Promise<void>;
  /** İşleyiciyi bağlar; kuyruk kapanırken çağrılacak `close` döner. */
  process(handler: (job: NotificationJob) => Promise<void>): Promise<() => Promise<void>>;
}

export interface ProcessorDeps {
  push: PushClient;
  queue: Pick<NotificationQueue, 'enqueue'>;
  now: () => Date;
  tokensOf(userId: string): Promise<string[]>;
  /** Olayı bu kullanıcı için ilk kez mi işliyoruz? Evetse true (kayıt atılır), daha önce gönderildiyse false. */
  claim(job: NotificationJob): Promise<boolean>;
  /** Gönderilemeyen kaydı serbest bırakır ki yeniden denenebilsin. */
  release(job: NotificationJob): Promise<void>;
  dropToken(token: string): Promise<void>;
}

export type Outcome = 'sent' | 'deferred' | 'duplicate' | 'no-device' | 'failed';

/**
 * Tek bildirim işi: sessiz saat denetimi (don hariç) → mükerrer denetimi → gönderim.
 * Sessiz saatte olan iş, yerel 06:00'ya geciktirilerek kuyruğa geri konur.
 */
export async function processNotification(
  job: NotificationJob,
  deps: ProcessorDeps,
): Promise<Outcome> {
  const now = deps.now();
  const d = decideDelivery(job.kind, now);
  if (d.action === 'defer') {
    await deps.queue.enqueue(job, { delayMs: d.until.getTime() - now.getTime() });
    return 'deferred';
  }
  const tokens = await deps.tokensOf(job.userId);
  if (tokens.length === 0) return 'no-device';
  if (!(await deps.claim(job))) return 'duplicate';

  const results = await deps.push.send(
    tokens.map((to) => ({
      to,
      title: job.title,
      body: job.body,
      data: { kind: job.kind, ...job.data },
      priority: job.kind === 'frost' ? ('high' as const) : ('default' as const),
    })),
  );
  for (const r of results) if (r.invalidToken) await deps.dropToken(r.token);
  if (results.some((r) => r.ok)) return 'sent';
  await deps.release(job); // hiçbir cihaza gitmedi: sonraki taramada yeniden denenir
  return 'failed';
}

/** Bellek içi kuyruk. Gecikmeli işler `advance`/gerçek zamanlayıcıyla çalışır. */
export class InMemoryQueue implements NotificationQueue {
  private handler: ((job: NotificationJob) => Promise<void>) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  readonly delayed: { job: NotificationJob; delayMs: number }[] = [];
  private pending: Promise<void>[] = [];

  async enqueue(job: NotificationJob, opts: { delayMs?: number } = {}): Promise<void> {
    const delay = opts.delayMs ?? 0;
    if (delay > 0) {
      this.delayed.push({ job, delayMs: delay });
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.pending.push(this.run(job));
      }, delay);
      t.unref?.();
      this.timers.add(t);
      return;
    }
    this.pending.push(this.run(job));
  }

  private async run(job: NotificationJob) {
    if (this.handler) await this.handler(job);
  }

  /** Bekleyen anlık işler bitene kadar bekler (testler için). */
  async idle(): Promise<void> {
    while (this.pending.length > 0) {
      const p = this.pending;
      this.pending = [];
      await Promise.all(p);
    }
  }

  async process(handler: (job: NotificationJob) => Promise<void>) {
    this.handler = handler;
    return async () => {
      this.handler = null;
      this.timers.forEach(clearTimeout);
      this.timers.clear();
    };
  }
}

const QUEUE_NAME = 'bildirim';

interface BullAdd {
  add(name: string, data: unknown, opts: Record<string, unknown>): Promise<unknown>;
}

/** BullMQ (Redis) kuyruğu. `bullmq` yalnız burada, gerektiğinde yüklenir. */
export class BullQueue implements NotificationQueue {
  constructor(private readonly redisUrl: string) {}

  private connection() {
    const u = new URL(this.redisUrl);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password || undefined,
      maxRetriesPerRequest: null as null,
    };
  }

  async enqueue(job: NotificationJob, opts: { delayMs?: number } = {}): Promise<void> {
    const { Queue } = await import('bullmq');
    this.queue ??= new Queue(QUEUE_NAME, { connection: this.connection() });
    await (this.queue as unknown as BullAdd).add(job.kind, job, {
      delay: opts.delayMs,
      // Ertelenen iş aynı kimlikle yeniden eklenebilsin diye gecikme sonekiyle.
      jobId: `${job.dedupeKey}:${job.userId}${opts.delayMs ? `:d${Date.now()}` : ''}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async process(handler: (job: NotificationJob) => Promise<void>) {
    const { Worker } = await import('bullmq');
    const worker = new Worker(QUEUE_NAME, async (j) => handler(j.data as NotificationJob), {
      connection: this.connection(),
    });
    return async () => {
      await worker.close();
      await this.queue?.close();
    };
  }

  private queue: { add: (...a: never[]) => Promise<unknown>; close(): Promise<void> } | undefined;
}

/** REDIS_URL varsa BullMQ, yoksa bellek içi kuyruk. */
export function createQueue(redisUrl = process.env['REDIS_URL']): NotificationQueue {
  return redisUrl ? new BullQueue(redisUrl) : new InMemoryQueue();
}
