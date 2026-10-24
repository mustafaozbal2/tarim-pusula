import mqtt from 'mqtt';
import { topicMatches, type BusClient, type Handler } from '@tarim/device-sim';

export interface MqttBusOptions {
  url: string;
  username: string;
  password: string;
  /** Kalıcı oturum (clean=false): kopukken biriken QoS 1 mesajlar yeniden bağlanınca gelir. */
  persistent?: boolean;
  /** Aynı kullanıcı adının tekrar bağlanmasında sabit istemci kimliği için. */
  clientId?: string;
}

/**
 * Gerçek MQTT aracısına (Mosquitto) bağlanan `BusClient`. Süreç içi aracıyla (device-sim) aynı yüzeyi sunar;
 * ACL ve kimlik doğrulama aracıdadır (infra/mosquitto.prod.conf). Tüm yayın ve abonelikler QoS 1.
 * Yetkisiz abonelik MQTT 3.1.1'de sessizce reddedilir (granted 0x80): bu durumda `subscribe` hata fırlatır.
 */
export class MqttBus implements BusClient {
  private subs: Array<{ filter: string; handler: Handler }> = [];
  private constructor(private readonly client: mqtt.MqttClient) {
    client.on('message', (topic, payload) => {
      for (const s of this.subs)
        if (topicMatches(s.filter, topic)) s.handler(topic, payload.toString());
    });
  }

  static async connect(o: MqttBusOptions): Promise<MqttBus> {
    const client = mqtt.connect(o.url, {
      username: o.username,
      password: o.password,
      clean: !o.persistent,
      clientId:
        o.clientId ?? `${o.username}-${o.persistent ? 'p' : Math.random().toString(16).slice(2)}`,
      reconnectPeriod: 0,
      protocolVersion: 4,
    });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('error', reject);
      client.once('close', () => reject(new Error('Bağlantı kapandı')));
    });
    return new MqttBus(client);
  }

  get connected(): boolean {
    return this.client.connected;
  }

  async publish(topic: string, payload: string): Promise<void> {
    await this.client.publishAsync(topic, payload, { qos: 1 });
  }

  async subscribe(filter: string, handler: Handler): Promise<() => void> {
    const sub = { filter, handler };
    this.subs.push(sub);
    const granted = await this.client.subscribeAsync(filter, { qos: 1 });
    if (granted.some((g) => g.qos === 128)) {
      this.subs = this.subs.filter((s) => s !== sub);
      throw new Error(`Abonelik reddedildi: ${filter}`);
    }
    return () => {
      this.subs = this.subs.filter((s) => s !== sub);
      void this.client.unsubscribeAsync(filter).catch(() => undefined);
    };
  }

  disconnect(): void {
    void this.client.endAsync(true);
  }

  /** Temiz kapanış (bekleyen yayınlar bitsin). */
  async close(): Promise<void> {
    await this.client.endAsync(false);
  }
}
