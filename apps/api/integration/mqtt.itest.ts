import { afterEach, describe, expect, it } from 'vitest';
import {
  ackTopic,
  cmdTopic,
  mqttPasswordFor,
  signCommand,
  verifyCommand,
  type CommandMsg,
} from '@tarim/device-sim';
import mqtt from 'mqtt';
import { MqttBus } from '../src/mqtt';

// ACL'li Mosquitto (docker-compose.test.yml): kullanıcılar tp-server, dev-1, dev-2.
const URL = process.env['MQTT_ACL_URL'] ?? 'mqtt://localhost:1884';
const open: MqttBus[] = [];
const connect = async (username: string, password: string, persistent = false) => {
  const b = await MqttBus.connect({ url: URL, username, password, persistent });
  open.push(b);
  return b;
};
const server = () => connect('tp-server', 'test-server-pw');
const dev1 = (persistent = false) => connect('dev-1', 'test-dev1-pw', persistent);
const dev2 = () => connect('dev-2', 'test-dev2-pw');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  await Promise.all(open.splice(0).map((b) => b.close().catch(() => undefined)));
});

describe('gerçek Mosquitto: kimlik ve ACL', () => {
  it('kimliksiz ve yanlış parolalı bağlantı reddedilir', async () => {
    await expect(MqttBus.connect({ url: URL, username: '', password: '' })).rejects.toThrow();
    await expect(
      MqttBus.connect({ url: URL, username: 'dev-1', password: 'yanlis' }),
    ).rejects.toThrow();
  });

  it('sunucu komut yazar; yalnız hedef cihaz alır, diğer cihaz hiçbir şey almaz', async () => {
    const s = await server();
    const a = await dev1();
    const b = await dev2();
    const gotA: string[] = [];
    const gotB: string[] = [];
    await a.subscribe(cmdTopic('dev-1'), (_t, p) => gotA.push(p));
    // Mosquitto yetkisiz aboneliği kabul etmiş gibi görünebilir ama mesaj hiç teslim etmez.
    await b.subscribe(cmdTopic('dev-1'), (_t, p) => gotB.push(p)).catch(() => undefined);
    await s.publish(cmdTopic('dev-1'), 'merhaba');
    await wait(300);
    expect(gotA).toEqual(['merhaba']);
    expect(gotB).toEqual([]);
  });

  it('cihaz başka cihaz adına ack yazamaz ve komut yazamaz (sessizce düşer)', async () => {
    const s = await server();
    const a = await dev1();
    const acks: string[] = [];
    const cmds: string[] = [];
    await s.subscribe('tp/dev/+/ack', (_t, p) => acks.push(p));
    const other = await dev2();
    await other.subscribe(cmdTopic('dev-2'), (_t, p) => cmds.push(p));
    await a.publish(ackTopic('dev-2'), 'sahte-ack');
    await a.publish(cmdTopic('dev-2'), 'sahte-komut');
    await a.publish(ackTopic('dev-1'), 'gercek-ack');
    await wait(400);
    expect(acks).toEqual(['gercek-ack']);
    expect(cmds).toEqual([]);
  });

  it('imzalı komut aracıdan geçince cihazda doğrulanır; kurcalanmışı reddedilir', async () => {
    const secret = 'cihaz-sirri-test';
    const s = await server();
    const a = await dev1();
    const seen: CommandMsg[] = [];
    await a.subscribe(cmdTopic('dev-1'), (_t, p) => seen.push(JSON.parse(p) as CommandMsg));
    const now = Date.now();
    const msg = signCommand(secret, {
      v: 1,
      id: 'k1',
      deviceId: 'dev-1',
      action: 'open',
      minutes: 10,
      issuedAt: now,
      expiresAt: now + 60_000,
    });
    await s.publish(cmdTopic('dev-1'), JSON.stringify(msg));
    await s.publish(cmdTopic('dev-1'), JSON.stringify({ ...msg, id: 'k2', minutes: 600 }));
    await wait(400);
    expect(seen.map((m) => verifyCommand(secret, m))).toEqual([true, false]);
    expect(mqttPasswordFor(secret)).toHaveLength(64);
  });

  it('kalıcı oturum: cihaz kopukken gelen QoS 1 komut yeniden bağlanınca teslim edilir', async () => {
    const s = await server();
    const first = await dev1(true);
    await first.subscribe(cmdTopic('dev-1'), () => undefined);
    await first.close();
    await s.publish(cmdTopic('dev-1'), 'kopukken-gelen');
    await wait(200);
    const raw = mqtt.connect(URL, {
      username: 'dev-1',
      password: 'test-dev1-pw',
      clientId: 'dev-1-p',
      clean: false,
      reconnectPeriod: 0,
    });
    const got: string[] = [];
    raw.on('message', (_t, p) => got.push(p.toString()));
    await new Promise((r) => raw.once('connect', r));
    await wait(400);
    await raw.endAsync(true);
    expect(got).toEqual(['kopukken-gelen']);
  });

  it('gerçek aracıda komut > cihaz > ack gidiş-dönüş gecikmesi ölçülür (50 tur, yerel ağ)', async () => {
    const s = await server();
    const d = await dev1();
    const sent = new Map<string, number>();
    const rtt: number[] = [];
    await d.subscribe(cmdTopic('dev-1'), (_t, p) => void d.publish(ackTopic('dev-1'), p));
    await s.subscribe(ackTopic('dev-1'), (_t, p) => {
      const t0 = sent.get(p);
      if (t0 !== undefined) rtt.push(performance.now() - t0);
    });
    for (let i = 0; i < 50; i++) {
      const id = `tur-${i}`;
      sent.set(id, performance.now());
      await s.publish(cmdTopic('dev-1'), id);
      for (let k = 0; k < 100 && rtt.length <= i; k++) await wait(10);
    }
    expect(rtt).toHaveLength(50);
    const sorted = [...rtt].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
    // Yerel döngü ağıdır: İnternet/GSM gecikmesi YOKTUR; yalnızca aracı + istemci payını ölçer.
    console.log(
      `[mqtt-gecikme] p50=${q(0.5).toFixed(1)} ms p95=${q(0.95).toFixed(1)} ms max=${q(1).toFixed(1)} ms`,
    );
    expect(q(0.95)).toBeLessThan(500);
  });
});
