import { InMemoryBroker } from './broker';
import { ManualClock } from './clock';
import { VirtualDevice } from './device';
import {
  ALL_ACKS,
  DEFAULT_COMMAND_TTL_MS,
  type AckMsg,
  cmdTopic,
  mqttPasswordFor,
  signCommand,
} from './protocol';

/** Belirlenimli sözde rastgele sayı üreteci (aynı tohum, aynı rapor). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LatencyOptions {
  commands: number;
  seed: number;
  /** Tek yön ağ gecikmesi: log-normal, ortanca (ms) ve yayılım. Kırsal 3G/zayıf Wi-Fi varsayımı. */
  medianOneWayMs: number;
  sigma: number;
  /** Bu olasılıkla tek yön gecikmesine ek sıçrama (yeniden iletim / zayıf sinyal). */
  spikeProbability: number;
  spikeMs: number;
}

export interface LatencyReport {
  options: LatencyOptions;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
  /** TTL (60 sn) içinde onaylanan oran. */
  withinTtl: number;
}

export const DEFAULT_LATENCY: LatencyOptions = {
  commands: 2000,
  seed: 20261020,
  medianOneWayMs: 150,
  sigma: 0.6,
  spikeProbability: 0.02,
  spikeMs: 3000,
};

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;

/**
 * Sunucu > aracı > cihaz > ack > sunucu gidiş-dönüş gecikmesini, saat sanal olduğu için
 * belirlenimli biçimde ölçer. Ağ gecikmesi MODELDİR (gerçek ölçüm değil): gerçek donanım/şebeke
 * ölçümü donanım gelince aynı rapor biçimiyle yapılmalıdır.
 */
export async function runLatencyBench(over: Partial<LatencyOptions> = {}): Promise<LatencyReport> {
  const o = { ...DEFAULT_LATENCY, ...over };
  const rnd = mulberry32(o.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const oneWay = () =>
    Math.round(
      o.medianOneWayMs * Math.exp(o.sigma * gauss()) + (rnd() < o.spikeProbability ? o.spikeMs : 0),
    );

  const clock = new ManualClock();
  const broker = new InMemoryBroker(clock, oneWay);
  const secret = 'bench-secret';
  const dev = new VirtualDevice({ id: 'bench', secret, broker, clock });
  broker.addDevice('bench', mqttPasswordFor(secret));
  broker.addServer('server', 'pw');
  const server = broker.connect('server', 'pw', { persistent: true });
  const sentAt = new Map<string, number>();
  const samples: number[] = [];
  await server.subscribe(ALL_ACKS, (_t, p) => {
    const ack = JSON.parse(p) as AckMsg;
    const t0 = sentAt.get(ack.commandId);
    if (t0 !== undefined) samples.push(clock.now() - t0);
  });
  await dev.connect();
  clock.advance(1000);

  for (let i = 0; i < o.commands; i++) {
    const id = `b${i}`;
    const now = clock.now();
    // Her tur: aç, sonra kapat (vana 30 dk tavanına takılmasın). Yalnız "aç" gecikmesi örneklenir.
    const open = signCommand(secret, {
      v: 1,
      id,
      deviceId: 'bench',
      action: 'open',
      minutes: 1,
      issuedAt: now,
      expiresAt: now + DEFAULT_COMMAND_TTL_MS,
    });
    sentAt.set(id, now);
    await server.publish(cmdTopic('bench'), JSON.stringify(open));
    clock.advance(20_000);
    const closeId = `x${i}`;
    const t = clock.now();
    await server.publish(
      cmdTopic('bench'),
      JSON.stringify(
        signCommand(secret, {
          v: 1,
          id: closeId,
          deviceId: 'bench',
          action: 'close',
          minutes: 0,
          issuedAt: t,
          expiresAt: t + DEFAULT_COMMAND_TTL_MS,
        }),
      ),
    );
    clock.advance(20_000);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const opens = sorted.length;
  return {
    options: o,
    count: opens,
    p50Ms: pct(sorted, 0.5),
    p95Ms: pct(sorted, 0.95),
    p99Ms: pct(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
    meanMs: Math.round(sorted.reduce((s, x) => s + x, 0) / Math.max(1, opens)),
    withinTtl: sorted.filter((x) => x <= DEFAULT_COMMAND_TTL_MS).length / Math.max(1, opens),
  };
}

export function formatReport(r: LatencyReport): string {
  const o = r.options;
  return `# G8 — Komut gecikmesi raporu

Bu rapor \`pnpm --filter @tarim/device-sim bench\` ile üretilir (tohum ${o.seed}, belirlenimli).

**Ne ölçülür:** sunucunun komutu yayınlamasından cihazın ack'inin sunucuya ulaşmasına kadar gidiş-dönüş süresi
(sunucu > aracı > cihaz > ack > sunucu). Komut imzası doğrulama, TTL ve yinelenme denetimleri dahildir.

**Dürüstlük notu:** ağ gecikmesi MODELDİR, ölçüm değildir. Tek yön gecikme log-normal: ortanca ${o.medianOneWayMs} ms,
sigma ${o.sigma}; ayrıca her teslimde %${(o.spikeProbability * 100).toFixed(0)} olasılıkla +${o.spikeMs} ms sıçrama
(zayıf sinyal / yeniden iletim). Gerçek ESP32 + GSM/Wi-Fi ölçümü donanım gelince aynı biçimle yapılmalıdır.
Sunucu tarafında gerçek (süreç içi) gidiş-dönüş ayrıca her komutta \`irrigation_commands.latency_ms\` alanına yazılır;
yönetici \`GET /admin/irrigation/latency\` ile p50/p95 görür.

| Ölçüt | Değer |
|---|---|
| Örnek (komut) sayısı | ${r.count} |
| Ortalama | ${r.meanMs} ms |
| Ortanca (p50) | ${r.p50Ms} ms |
| p95 | ${r.p95Ms} ms |
| p99 | ${r.p99Ms} ms |
| En büyük | ${r.maxMs} ms |
| TTL (60 sn) içinde onaylanan | %${(r.withinTtl * 100).toFixed(2)} |

**Yorum:** Ortanca gidiş-dönüş yaklaşık ${(r.p50Ms / 1000).toFixed(1)} sn. Onay (ack) TTL içinde gelmezse arayüz
"cihaza ulaşılamadı" der ve komut zaman aşımına uğrar; cihaz geç gelen komutu kendi saatiyle reddeder.
`;
}
