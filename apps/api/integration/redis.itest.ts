import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BullQueue, type NotificationJob } from '@tarim/workers';

const REDIS = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c().catch(() => undefined);
});

const job = (over: Partial<NotificationJob> = {}): NotificationJob => ({
  kind: 'frost',
  userId: randomUUID(),
  title: 'Don riski',
  body: 'Bu gece don olabilir.',
  dedupeKey: `frost:${randomUUID()}`,
  ...over,
});

async function until(cond: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('gerçek Redis: BullMQ bildirim kuyruğu', () => {
  it('eklenen iş işleyiciye ulaşır', async () => {
    const q = new BullQueue(REDIS);
    const got: NotificationJob[] = [];
    closers.push(await q.process(async (j) => void got.push(j)));
    const j = job();
    await q.enqueue(j);
    await until(() => got.some((g) => g.dedupeKey === j.dedupeKey));
    expect(got.find((g) => g.dedupeKey === j.dedupeKey)).toMatchObject({
      userId: j.userId,
      kind: 'frost',
    });
  });

  it('aynı olay anahtarı iki kez eklenirse tek kez işlenir', async () => {
    const q = new BullQueue(REDIS);
    const got: NotificationJob[] = [];
    closers.push(await q.process(async (j) => void got.push(j)));
    const j = job();
    await q.enqueue(j);
    await q.enqueue(j);
    await until(() => got.some((g) => g.dedupeKey === j.dedupeKey));
    await new Promise((r) => setTimeout(r, 500));
    expect(got.filter((g) => g.dedupeKey === j.dedupeKey)).toHaveLength(1);
  });

  it('gecikmeli iş gecikme dolmadan işlenmez', async () => {
    const q = new BullQueue(REDIS);
    const got: Array<{ at: number; j: NotificationJob }> = [];
    closers.push(await q.process(async (j) => void got.push({ at: Date.now(), j })));
    const j = job({ kind: 'irrigation' });
    const t0 = Date.now();
    await q.enqueue(j, { delayMs: 1200 });
    await new Promise((r) => setTimeout(r, 500));
    expect(got.find((g) => g.j.dedupeKey === j.dedupeKey)).toBeUndefined();
    await until(() => got.some((g) => g.j.dedupeKey === j.dedupeKey));
    expect(got.find((g) => g.j.dedupeKey === j.dedupeKey)!.at - t0).toBeGreaterThanOrEqual(1100);
  });
});
