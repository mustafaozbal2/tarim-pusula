import type { BusClient, InMemoryBroker } from './broker';
import { type Clock, systemClock } from './clock';
import {
  type AckMsg,
  type CommandMsg,
  type RejectReason,
  type StateMsg,
  type StateReason,
  ackTopic,
  clampValveMinutes,
  cmdTopic,
  isCommandMsg,
  MAX_VALVE_MINUTES,
  mqttPasswordFor,
  stateTopic,
  verifyCommand,
} from './protocol';

const MINUTE = 60_000;
/** Cihaz son komut kimliklerini bellekte tutar (taşan eskiyi atar); çoğaltılan komut ikinci kez çalışmaz. */
const SEEN_LIMIT = 64;

export interface VirtualDeviceOptions {
  id: string;
  /** Sunucunun yazdığı cihaz sırrı; parola ve komut anahtarı bundan türetilir. */
  secret: string;
  broker: InMemoryBroker;
  clock?: Clock;
  /** Test için bağlanma sırasında kalıcı oturum (varsayılan: evet, gerçek cihazdaki QoS 1 gibi). */
  persistent?: boolean;
}

/**
 * Sanal ESP32 sulama denetleyicisi. Güvenlik kuralları AĞDAN BAĞIMSIZ yerelde çalışır:
 *  - vana yalnız imzalı, süresi geçmemiş, yeni komutla açılır;
 *  - açılış süresi 30 dakikaya kırpılır ve kesintisiz açıklık 30 dakikayı hiçbir komutla aşamaz;
 *  - kapatma zamanlayıcısı cihazdadır: bağlantı kopsa da vana kapanır;
 *  - güç gidince vana kapanır (normalde kapalı valf).
 */
export class VirtualDevice {
  readonly id: string;
  private readonly secret: string;
  private readonly broker: InMemoryBroker;
  private readonly clock: Clock;
  private readonly persistent: boolean;

  private client: BusClient | null = null;
  private cancelClose: (() => void) | null = null;
  private outbox: Array<{ topic: string; payload: string }> = [];
  private seen = new Map<string, AckMsg>();
  private lastIssuedAt = 0;

  valveOpen = false;
  closesAt: number | null = null;
  private openedAt: number | null = null;
  /** Vananın kendi zamanlayıcısıyla kapandığı (azami süre/istenen süre) sayısı. */
  autoCloses = 0;
  /** Vananın açık kaldığı toplam süre (ms): dayanıklılık raporları için. */
  openMs = 0;

  constructor(o: VirtualDeviceOptions) {
    this.id = o.id;
    this.secret = o.secret;
    this.broker = o.broker;
    this.clock = o.clock ?? systemClock;
    this.persistent = o.persistent ?? true;
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  /** Ağa bağlanır, komut konusuna abone olur, bekleyen yayınları gönderir. */
  async connect(): Promise<void> {
    this.client = this.broker.connect(this.id, mqttPasswordFor(this.secret), {
      persistent: this.persistent,
    });
    await this.client.subscribe(cmdTopic(this.id), (_t, payload) => this.onMessage(payload));
    await this.flush();
    this.state('online');
  }

  /** Bağlantı kopması: vana ve zamanlayıcı etkilenmez. */
  disconnect(): void {
    this.client?.disconnect();
  }

  /** Elektrik kesintisi: vana kapanır, bellekteki komut geçmişi ve çıkış kuyruğu gider. */
  powerCycle(): void {
    this.disconnect();
    this.closeValve();
    this.seen.clear();
    this.outbox = [];
    this.lastIssuedAt = 0;
  }

  private onMessage(payload: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      return; // çözümlenemeyen mesaja cevap verilmez (kimlik bilinmiyor)
    }
    if (!isCommandMsg(raw)) return;
    this.handle(raw);
  }

  private handle(cmd: CommandMsg): void {
    const prior = this.seen.get(cmd.id);
    if (prior) {
      this.send(ackTopic(this.id), prior); // tekrar: aynı cevap, ikinci icra yok
      return;
    }
    if (cmd.deviceId !== this.id) return this.reject(cmd, 'wrong_device');
    if (!verifyCommand(this.secret, cmd)) return this.reject(cmd, 'bad_signature');
    const now = this.clock.now();
    if (now > cmd.expiresAt) return this.reject(cmd, 'expired');
    // Kuyrukta bekleyip geç gelen eski komut, daha yeni bir komutu ezmesin.
    if (cmd.issuedAt < this.lastIssuedAt) return this.reject(cmd, 'stale');

    if (cmd.action === 'open') {
      const minutes = clampValveMinutes(cmd.minutes);
      if (minutes === 0) return this.reject(cmd, 'invalid_duration');
      this.openValve(minutes);
    } else {
      this.closeValve();
      this.state('command');
    }
    this.lastIssuedAt = cmd.issuedAt;
    this.remember(cmd.id, {
      v: 1,
      commandId: cmd.id,
      deviceId: this.id,
      status: 'accepted',
      at: now,
      valveOpen: this.valveOpen,
      closesAt: this.closesAt,
    });
  }

  private openValve(minutes: number): void {
    const now = this.clock.now();
    this.openedAt ??= now;
    // Kesintisiz açıklık için sert tavan: yeniden "aç" komutu tavanı ileri taşıyamaz.
    const hardLimit = this.openedAt + MAX_VALVE_MINUTES * MINUTE;
    const closeAt = Math.min(now + minutes * MINUTE, hardLimit);
    this.valveOpen = true;
    this.closesAt = closeAt;
    this.cancelClose?.();
    this.cancelClose = this.clock.setTimeout(() => {
      this.autoCloses++;
      this.closeValve();
      this.state('timeout');
    }, closeAt - now);
    this.state('command');
  }

  private closeValve(): void {
    this.cancelClose?.();
    this.cancelClose = null;
    if (this.valveOpen && this.openedAt !== null) this.openMs += this.clock.now() - this.openedAt;
    this.valveOpen = false;
    this.closesAt = null;
    this.openedAt = null;
  }

  private reject(cmd: CommandMsg, reason: RejectReason): void {
    this.remember(cmd.id, {
      v: 1,
      commandId: cmd.id,
      deviceId: this.id,
      status: 'rejected',
      reason,
      at: this.clock.now(),
      valveOpen: this.valveOpen,
      closesAt: this.closesAt,
    });
  }

  private remember(id: string, ack: AckMsg): void {
    this.seen.set(id, ack);
    if (this.seen.size > SEEN_LIMIT) this.seen.delete(this.seen.keys().next().value as string);
    this.send(ackTopic(this.id), ack);
  }

  private state(reason: StateReason): void {
    const msg: StateMsg = {
      v: 1,
      deviceId: this.id,
      valveOpen: this.valveOpen,
      closesAt: this.closesAt,
      at: this.clock.now(),
      reason,
    };
    this.send(stateTopic(this.id), msg);
  }

  /** Bağlıysa hemen, değilse çıkış kuyruğuna; bağlantı gelince sırayla gider. */
  private send(topic: string, msg: object): void {
    const payload = JSON.stringify(msg);
    if (this.connected) void this.client!.publish(topic, payload);
    else this.outbox.push({ topic, payload });
  }

  private async flush(): Promise<void> {
    const pending = this.outbox.splice(0);
    for (const m of pending) await this.client!.publish(m.topic, m.payload);
  }
}
