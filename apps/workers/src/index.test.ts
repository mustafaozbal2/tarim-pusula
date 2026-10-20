import { describe, expect, it } from 'vitest';
import {
  ExpoPushClient,
  FakePushClient,
  InMemoryQueue,
  WORKERS_READY,
  decideDelivery,
  isQuietHour,
  nextAllowedTime,
  processNotification,
  type NotificationJob,
  type ProcessorDeps,
} from './index';

// Yerel saat (UTC+3) -> UTC anı
const tr = (iso: string) => new Date(`${iso}+03:00`);

it('iskelet yüklenir', () => {
  expect(WORKERS_READY).toBe(true);
});

describe('sessiz saatler (22:00-06:00)', () => {
  it('sınırlar: 21:59 açık, 22:00 sessiz, 05:59 sessiz, 06:00 açık', () => {
    expect(isQuietHour(tr('2026-10-20T21:59:00'))).toBe(false);
    expect(isQuietHour(tr('2026-10-20T22:00:00'))).toBe(true);
    expect(isQuietHour(tr('2026-10-21T00:00:00'))).toBe(true);
    expect(isQuietHour(tr('2026-10-21T05:59:00'))).toBe(true);
    expect(isQuietHour(tr('2026-10-21T06:00:00'))).toBe(false);
  });
  it('sonraki izin: gece yarısından önce ertesi gün 06:00, sonra aynı gün 06:00', () => {
    expect(nextAllowedTime(tr('2026-10-20T23:30:00')).toISOString()).toBe(
      tr('2026-10-21T06:00:00').toISOString(),
    );
    expect(nextAllowedTime(tr('2026-10-21T02:10:00')).toISOString()).toBe(
      tr('2026-10-21T06:00:00').toISOString(),
    );
    const day = tr('2026-10-21T12:00:00');
    expect(nextAllowedTime(day)).toBe(day);
  });
  it('don her saatte gider, diğerleri ertelenir', () => {
    const night = tr('2026-10-21T03:00:00');
    expect(decideDelivery('frost', night)).toEqual({ action: 'send' });
    expect(decideDelivery('irrigation', night)).toEqual({
      action: 'defer',
      until: tr('2026-10-21T06:00:00'),
    });
    expect(decideDelivery('info', tr('2026-10-21T10:00:00'))).toEqual({ action: 'send' });
  });
});

function setup(nowIso: string) {
  const push = new FakePushClient();
  const queue = new InMemoryQueue();
  const claimed = new Set<string>();
  const dropped: string[] = [];
  const tokens = new Map<string, string[]>([['u1', ['ExponentPushToken[a]']]]);
  const deps: ProcessorDeps = {
    push,
    queue,
    now: () => tr(nowIso),
    tokensOf: async (u) => tokens.get(u) ?? [],
    claim: async (j) =>
      !claimed.has(j.dedupeKey + j.userId) && !!claimed.add(j.dedupeKey + j.userId),
    release: async (j) => void claimed.delete(j.dedupeKey + j.userId),
    dropToken: async (t) => void dropped.push(t),
  };
  return { push, queue, deps, dropped, tokens };
}

const job = (over: Partial<NotificationJob> = {}): NotificationJob => ({
  kind: 'irrigation',
  userId: 'u1',
  title: 'Sulama',
  body: 'Bugün bekle',
  dedupeKey: 'k1',
  ...over,
});

describe('bildirim işleyici', () => {
  it('gündüz gönderir, aynı olayı ikinci kez göndermez', async () => {
    const s = setup('2026-10-21T10:00:00');
    expect(await processNotification(job(), s.deps)).toBe('sent');
    expect(await processNotification(job(), s.deps)).toBe('duplicate');
    expect(s.push.sent).toHaveLength(1);
  });
  it('gece sulama bildirimi 06:00’ya ertelenir, gönderilmez', async () => {
    const s = setup('2026-10-21T23:00:00');
    expect(await processNotification(job(), s.deps)).toBe('deferred');
    expect(s.push.sent).toHaveLength(0);
    expect(s.queue.delayed).toHaveLength(1);
    expect(s.queue.delayed[0]!.delayMs).toBe(7 * 3_600_000);
    await s.queue.process(async () => undefined).then((close) => close());
  });
  it('gece don bildirimi hemen, yüksek öncelikle gider', async () => {
    const s = setup('2026-10-21T03:00:00');
    expect(await processNotification(job({ kind: 'frost' }), s.deps)).toBe('sent');
    expect(s.push.sent[0]).toMatchObject({ priority: 'high', data: { kind: 'frost' } });
  });
  it('cihazı yoksa gönderilmez; geçersiz belirteç silinir ve yeniden denenebilir', async () => {
    const s = setup('2026-10-21T10:00:00');
    expect(await processNotification(job({ userId: 'yok' }), s.deps)).toBe('no-device');
    s.push.invalid.add('ExponentPushToken[a]');
    expect(await processNotification(job(), s.deps)).toBe('failed');
    expect(s.dropped).toEqual(['ExponentPushToken[a]']);
    s.push.invalid.clear();
    expect(await processNotification(job(), s.deps)).toBe('sent'); // kayıt serbest bırakılmıştı
  });
  it('bellek kuyruğu işleyiciyi çağırır', async () => {
    const s = setup('2026-10-21T10:00:00');
    await s.queue.process((j) => processNotification(j, s.deps).then(() => undefined));
    await s.queue.enqueue(job({ dedupeKey: 'k2' }));
    await s.queue.idle();
    expect(s.push.sent).toHaveLength(1);
  });
});

describe('Expo Push istemcisi', () => {
  it('100’lük gruplar halinde gönderir, bilet durumlarını çevirir', async () => {
    const calls: number[] = [];
    const fetchImpl = (async (_u: string, init: { body: string }) => {
      const msgs = JSON.parse(init.body) as { to: string }[];
      calls.push(msgs.length);
      return new Response(
        JSON.stringify({
          data: msgs.map((m) =>
            m.to === 'bad'
              ? { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok' },
          ),
        }),
      );
    }) as unknown as typeof fetch;
    const c = new ExpoPushClient({ fetchImpl });
    const msgs = Array.from({ length: 150 }, (_, i) => ({
      to: i === 120 ? 'bad' : `t${i}`,
      title: 'a',
      body: 'b',
    }));
    const r = await c.send(msgs);
    expect(calls).toEqual([100, 50]);
    expect(r.filter((x) => x.ok)).toHaveLength(149);
    expect(r[120]).toMatchObject({ ok: false, invalidToken: true });
  });
  it('ağ hatasında özel durum fırlatmaz, başarısız döner', async () => {
    const c = new ExpoPushClient({
      fetchImpl: (async () => {
        throw new Error('ağ yok');
      }) as unknown as typeof fetch,
    });
    const r = await c.send([{ to: 't', title: 'a', body: 'b' }]);
    expect(r[0]).toMatchObject({ ok: false, invalidToken: false });
  });
});
