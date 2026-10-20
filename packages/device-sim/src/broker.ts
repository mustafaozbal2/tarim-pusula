import { type Clock, systemClock } from './clock';
import { ackTopic, cmdTopic, stateTopic } from './protocol';

/** MQTT konu süzgeci eşleşmesi (`+` tek seviye, `#` kalan hepsi). */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return i === f.length - 1;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

export type Handler = (topic: string, payload: string) => void;

/** Sunucunun ve cihazın kullandığı en küçük MQTT benzeri yüzey. */
export interface Bus {
  publish(topic: string, payload: string): Promise<void>;
  /** Dönen işlev aboneliği bırakır. */
  subscribe(filter: string, handler: Handler): Promise<() => void>;
}

export interface BusClient extends Bus {
  readonly connected: boolean;
  disconnect(): void;
}

export class AuthError extends Error {
  constructor() {
    super('Bağlantı reddedildi: kimlik doğrulanamadı');
  }
}

interface Acl {
  pub: string[];
  sub: string[];
}
interface Session {
  acl: Acl;
  subs: Array<{ filter: string; handler: Handler }>;
  queue: Array<{ topic: string; payload: string }>;
  client?: Client;
}

export interface DeniedEntry {
  user: string;
  op: 'publish' | 'subscribe';
  topic: string;
}

/**
 * Süreç içi MQTT aracısı. Gerçek aracıdaki güvence katmanlarını uygular: kullanıcı/parola kimliği,
 * konu ACL'si (cihaz yalnız kendi konularında), kalıcı oturumda çevrimdışı kuyruk (QoS 1),
 * isteğe bağlı ağ gecikmesi. Üretimde aynı kurallar Mosquitto `acl_file` ve TLS ile sağlanır
 * (infra/mosquitto.prod.conf).
 */
export class InMemoryBroker {
  private creds = new Map<string, { password: string; acl: Acl }>();
  private sessions = new Map<string, Session>();
  /** ACL'nin sessizce düşürdüğü yayın/abonelik denemeleri (MQTT 3.1.1 davranışı; test için kayıtlı). */
  readonly denied: DeniedEntry[] = [];

  constructor(
    private readonly clock: Clock = systemClock,
    /** Her teslim için ağ gecikmesi (ms). */
    private readonly latencyMs: () => number = () => 0,
  ) {}

  addDevice(id: string, password: string): void {
    this.creds.set(id, {
      password,
      acl: { sub: [cmdTopic(id)], pub: [ackTopic(id), stateTopic(id)] },
    });
  }

  addServer(user: string, password: string): void {
    this.creds.set(user, {
      password,
      acl: { sub: ['tp/dev/+/ack', 'tp/dev/+/state'], pub: ['tp/dev/+/cmd'] },
    });
  }

  removeUser(user: string): void {
    this.creds.delete(user);
  }

  /** `persistent`: bağlantı kopunca kuyruğa alınan mesajlar yeniden bağlanınca teslim edilir. */
  connect(user: string, password: string, opts: { persistent?: boolean } = {}): BusClient {
    const c = this.creds.get(user);
    if (!c || c.password !== password) throw new AuthError();
    let s = this.sessions.get(user);
    if (!s || !opts.persistent) {
      s = { acl: c.acl, subs: [], queue: [], client: undefined };
      this.sessions.set(user, s);
    }
    s.client?.disconnect(); // aynı kimlikle ikinci bağlantı eskisini düşürür (MQTT)
    const client = new Client(this, user, s, opts.persistent ?? false);
    s.client = client;
    // Kopukken biriken mesajlar şimdi teslim edilir.
    for (const m of s.queue.splice(0)) this.deliverTo(s, m.topic, m.payload);
    return client;
  }

  /** @internal */
  publishFrom(user: string, s: Session, topic: string, payload: string): void {
    if (!s.acl.pub.some((f) => topicMatches(f, topic))) {
      this.denied.push({ user, op: 'publish', topic });
      return;
    }
    for (const other of this.sessions.values()) this.deliverTo(other, topic, payload);
  }

  /** @internal */
  subscribeFrom(user: string, s: Session, filter: string, handler: Handler): () => void {
    if (!s.acl.sub.some((f) => topicMatches(f, filter))) {
      this.denied.push({ user, op: 'subscribe', topic: filter });
      return () => undefined;
    }
    // Kalıcı oturumda aynı süzgeç yeniden istenirse abonelik çoğalmaz, işleyici yenilenir.
    s.subs = s.subs.filter((x) => x.filter !== filter);
    const sub = { filter, handler };
    s.subs.push(sub);
    return () => {
      s.subs = s.subs.filter((x) => x !== sub);
    };
  }

  private deliverTo(s: Session, topic: string, payload: string): void {
    const matching = s.subs.filter((x) => topicMatches(x.filter, topic));
    if (matching.length === 0) return;
    const client = s.client;
    if (!client?.connected) {
      if (!client || client.persistent) s.queue.push({ topic, payload });
      return;
    }
    const fire = () => {
      if (!client.connected) {
        if (client.persistent) s.queue.push({ topic, payload });
        return;
      }
      for (const m of matching) m.handler(topic, payload);
    };
    const delay = this.latencyMs();
    if (delay <= 0) fire();
    else this.clock.setTimeout(fire, delay);
  }
}

class Client implements BusClient {
  connected = true;
  constructor(
    private readonly broker: InMemoryBroker,
    private readonly user: string,
    private readonly session: Session,
    readonly persistent: boolean,
  ) {}

  async publish(topic: string, payload: string): Promise<void> {
    if (!this.connected) throw new Error('Bağlı değil');
    this.broker.publishFrom(this.user, this.session, topic, payload);
  }

  async subscribe(filter: string, handler: Handler): Promise<() => void> {
    if (!this.connected) throw new Error('Bağlı değil');
    return this.broker.subscribeFrom(this.user, this.session, filter, handler);
  }

  disconnect(): void {
    this.connected = false;
  }
}
