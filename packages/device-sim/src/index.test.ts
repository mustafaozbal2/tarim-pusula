import { describe, expect, it } from 'vitest';
import {
  type AckMsg,
  type CommandMsg,
  type StateMsg,
  ALL_ACKS,
  ALL_STATES,
  AuthError,
  InMemoryBroker,
  ManualClock,
  MAX_VALVE_MINUTES,
  VirtualDevice,
  ackTopic,
  clampValveMinutes,
  cmdTopic,
  mqttPasswordFor,
  signCommand,
  runLatencyBench,
  topicMatches,
} from './index';

const MIN = 60_000;
const SECRET = 'cihaz-sirri-1';

describe('cihazda azami vana süresi', () => {
  it('30 dakikayı aşamaz', () => {
    expect(clampValveMinutes(120)).toBe(MAX_VALVE_MINUTES);
    expect(clampValveMinutes(10)).toBe(10);
  });
  it('geçersiz süre 0 olur', () => {
    expect(clampValveMinutes(-5)).toBe(0);
    expect(clampValveMinutes(NaN)).toBe(0);
  });
});

describe('konu eşleşmesi', () => {
  it('+ ve # kuralları', () => {
    expect(topicMatches('tp/dev/+/ack', 'tp/dev/a/ack')).toBe(true);
    expect(topicMatches('tp/dev/+/ack', 'tp/dev/a/b/ack')).toBe(false);
    expect(topicMatches('tp/#', 'tp/dev/a/ack')).toBe(true);
    expect(topicMatches('tp/dev/a/cmd', 'tp/dev/b/cmd')).toBe(false);
  });
});

/** Sunucu + cihaz + elle ilerletilen saat. */
async function rig(opts: { latency?: () => number; persistent?: boolean } = {}) {
  const clock = new ManualClock();
  const broker = new InMemoryBroker(clock, opts.latency);
  const dev = new VirtualDevice({
    id: 'd1',
    secret: SECRET,
    broker,
    clock,
    persistent: opts.persistent,
  });
  broker.addDevice('d1', mqttPasswordFor(SECRET));
  broker.addServer('server', 'srv-pass');
  const server = broker.connect('server', 'srv-pass', { persistent: true });
  const acks: AckMsg[] = [];
  const states: StateMsg[] = [];
  await server.subscribe(ALL_ACKS, (_t, p) => acks.push(JSON.parse(p) as AckMsg));
  await server.subscribe(ALL_STATES, (_t, p) => states.push(JSON.parse(p) as StateMsg));
  await dev.connect();
  let n = 0;
  const cmd = (
    action: 'open' | 'close',
    minutes = 0,
    over: Partial<CommandMsg> = {},
    secret = SECRET,
  ): CommandMsg =>
    signCommand(secret, {
      v: 1,
      id: `c${++n}`,
      deviceId: 'd1',
      action,
      minutes,
      issuedAt: clock.now(),
      expiresAt: clock.now() + MIN,
      ...over,
    });
  const send = async (c: CommandMsg) => server.publish(cmdTopic('d1'), JSON.stringify(c));
  return { clock, broker, dev, server, acks, states, cmd, send };
}

describe('sanal ESP32: komut ve ack', () => {
  it('imzalı komutla vana açılır, ack gelir, süre dolunca kendiliğinden kapanır', async () => {
    const r = await rig();
    const c = r.cmd('open', 10);
    await r.send(c);
    expect(r.dev.valveOpen).toBe(true);
    expect(r.acks.at(-1)).toMatchObject({ commandId: c.id, status: 'accepted', valveOpen: true });
    r.clock.advance(9 * MIN);
    expect(r.dev.valveOpen).toBe(true);
    r.clock.advance(1 * MIN + 1);
    expect(r.dev.valveOpen).toBe(false);
    expect(r.dev.autoCloses).toBe(1);
    expect(r.states.at(-1)).toMatchObject({ valveOpen: false, reason: 'timeout' });
  });

  it('durdur komutu vanayı hemen kapatır', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 20));
    r.clock.advance(5 * MIN);
    await r.send(r.cmd('close'));
    expect(r.dev.valveOpen).toBe(false);
    expect(r.dev.openMs).toBe(5 * MIN);
  });

  it('60 dakika istense bile 30 dakikada kapanır', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 60));
    expect(r.dev.closesAt! - r.clock.now()).toBe(30 * MIN);
    r.clock.advance(30 * MIN + 1);
    expect(r.dev.valveOpen).toBe(false);
  });

  it('tekrar "aç" komutu kesintisiz 30 dakika sınırını ileri taşıyamaz', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 30));
    r.clock.advance(25 * MIN);
    await r.send(r.cmd('open', 30)); // 25. dakikada yeniden: 55. dakikaya uzamamalı
    expect(r.dev.closesAt! - r.clock.now()).toBe(5 * MIN);
    r.clock.advance(5 * MIN + 1);
    expect(r.dev.valveOpen).toBe(false);
    expect(r.dev.openMs).toBe(30 * MIN);
  });

  it('süre 0 ya da olumsuz: reddedilir, vana açılmaz', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 0));
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)).toMatchObject({ status: 'rejected', reason: 'invalid_duration' });
  });

  it('aynı komut kimliği iki kez gelirse bir kez icra edilir, aynı ack tekrarlanır', async () => {
    const r = await rig();
    const c = r.cmd('open', 10);
    await r.send(c);
    r.clock.advance(4 * MIN);
    await r.send(c); // yeniden iletim
    expect(r.dev.closesAt).toBe(c.issuedAt + 10 * MIN); // süre yeniden başlamadı
    expect(r.acks.filter((a) => a.commandId === c.id)).toHaveLength(2);
    expect(r.acks.at(-1)?.status).toBe('accepted');
  });
});

describe('sanal ESP32: reddedilen komutlar', () => {
  it('yanlış imza (başka sırla imzalı) vanayı açmaz', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 10, {}, 'baska-sir'));
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)).toMatchObject({ status: 'rejected', reason: 'bad_signature' });
  });

  it('alanı değiştirilmiş komut (imza sonrası süre artırma) reddedilir', async () => {
    const r = await rig();
    const c = r.cmd('open', 5);
    await r.send({ ...c, minutes: 30 });
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)?.reason).toBe('bad_signature');
  });

  it('süresi geçmiş (TTL) komut reddedilir', async () => {
    const r = await rig();
    const c = r.cmd('open', 10);
    r.clock.advance(2 * MIN);
    await r.send(c);
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)?.reason).toBe('expired');
  });

  it('başka cihaza imzalı komut kabul edilmez', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 10, { deviceId: 'd2' }));
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)?.reason).toBe('wrong_device');
  });

  it('daha yeni bir komuttan sonra gelen eski komut (stale) icra edilmez', async () => {
    const r = await rig();
    const old = r.cmd('open', 10, { issuedAt: r.clock.now() - 5_000 });
    await r.send(r.cmd('close'));
    await r.send(old);
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)?.reason).toBe('stale');
  });

  it('çöp mesaj cihazı bozmaz', async () => {
    const r = await rig();
    await r.server.publish(cmdTopic('d1'), '{bozuk');
    await r.server.publish(cmdTopic('d1'), JSON.stringify({ v: 1 }));
    expect(r.dev.valveOpen).toBe(false);
  });
});

describe('bağlantı kopması ve elektrik kesintisi', () => {
  it('bağlantı koptuktan sonra da vana azami sürede kapanır', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 60));
    r.clock.advance(1 * MIN);
    r.dev.disconnect(); // ağ gitti
    expect(r.dev.connected).toBe(false);
    r.clock.advance(28 * MIN);
    expect(r.dev.valveOpen).toBe(true);
    r.clock.advance(1 * MIN + 1);
    expect(r.dev.valveOpen).toBe(false); // sunucu ulaşamasa da kapandı
    expect(r.dev.openMs).toBeLessThanOrEqual(30 * MIN);
  });

  it('kopukken olanlar (kapanış durumu) bağlantı gelince sunucuya iletilir', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 5));
    r.dev.disconnect();
    r.clock.advance(6 * MIN);
    const before = r.states.length;
    await r.dev.connect();
    const late = r.states.slice(before);
    expect(late.some((s) => s.reason === 'timeout' && !s.valveOpen)).toBe(true);
  });

  it('kopukken gönderilen komut kuyrukta bekler; TTL geçtiyse yeniden bağlanınca reddedilir', async () => {
    const r = await rig();
    r.dev.disconnect();
    const c = r.cmd('open', 10); // TTL 60 sn
    await r.send(c);
    r.clock.advance(5 * MIN);
    await r.dev.connect();
    expect(r.dev.valveOpen).toBe(false);
    expect(r.acks.at(-1)).toMatchObject({ commandId: c.id, status: 'rejected', reason: 'expired' });
  });

  it('kopukken gönderilen taze komut yeniden bağlanınca icra edilir', async () => {
    const r = await rig();
    r.dev.disconnect();
    const c = r.cmd('open', 10);
    await r.send(c);
    r.clock.advance(10_000);
    await r.dev.connect();
    expect(r.dev.valveOpen).toBe(true);
    expect(r.acks.at(-1)).toMatchObject({ commandId: c.id, status: 'accepted' });
  });

  it('elektrik kesilince vana kapanır ve açılışta kapalı başlar', async () => {
    const r = await rig();
    await r.send(r.cmd('open', 20));
    r.dev.powerCycle();
    expect(r.dev.valveOpen).toBe(false);
    r.clock.advance(60 * MIN);
    expect(r.dev.valveOpen).toBe(false);
  });
});

describe('aracı: kimlik ve konu ACL', () => {
  it('yanlış parola bağlanamaz', async () => {
    const r = await rig();
    expect(() => r.broker.connect('d1', 'yanlis')).toThrow(AuthError);
    expect(() => r.broker.connect('yok', 'x')).toThrow(AuthError);
  });

  it('cihaz başkasının komut konusuna abone olamaz ve başkası adına ack yayınlayamaz', async () => {
    const r = await rig();
    r.broker.addDevice('d2', mqttPasswordFor('baska'));
    const other = r.broker.connect('d2', mqttPasswordFor('baska'));
    const got: string[] = [];
    await other.subscribe(cmdTopic('d1'), (_t, p) => got.push(p));
    await r.send(r.cmd('open', 5));
    expect(got).toEqual([]);
    const before = r.acks.length;
    await other.publish(
      ackTopic('d1'),
      JSON.stringify({ v: 1, commandId: 'x', status: 'accepted' }),
    );
    expect(r.acks.length).toBe(before);
    expect(r.broker.denied.map((d) => d.op)).toEqual(['subscribe', 'publish']);
  });

  it('cihaz komut konusuna yayın yapamaz (kendi kendine komut veremez)', async () => {
    const r = await rig();
    const d = r.broker.connect('d1', mqttPasswordFor(SECRET));
    await d.publish(cmdTopic('d1'), JSON.stringify(r.cmd('open', 10)));
    expect(r.dev.valveOpen).toBe(false);
    expect(r.broker.denied.some((x) => x.user === 'd1' && x.op === 'publish')).toBe(true);
  });
});

describe('gecikme ölçümü', () => {
  it('belirlenimli: aynı tohum aynı sonucu verir; ortanca ve p95 makul', async () => {
    const a = await runLatencyBench({ commands: 300 });
    const b = await runLatencyBench({ commands: 300 });
    expect(a).toEqual(b);
    expect(a.count).toBe(300);
    // Gidiş-dönüş en az iki tek-yön gecikmesi: ortanca ~300 ms civarı.
    expect(a.p50Ms).toBeGreaterThan(150);
    expect(a.p50Ms).toBeLessThan(800);
    expect(a.p95Ms).toBeGreaterThanOrEqual(a.p50Ms);
    expect(a.withinTtl).toBeGreaterThan(0.99);
  });
});
