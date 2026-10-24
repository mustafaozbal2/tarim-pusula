import { randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ALL_ACKS,
  ALL_STATES,
  DEFAULT_COMMAND_TTL_MS,
  InMemoryBroker,
  type AckMsg,
  type BusClient,
  type StateMsg,
  cmdTopic,
  mqttPasswordFor,
  signCommand,
} from '@tarim/device-sim';
import {
  MAX_IRRIGATION_MINUTES,
  type CommandCreate,
  type CommandDto,
  type DeviceStatusDto,
} from '@tarim/schemas';
import { AUTH_CONFIG, type AuthConfig } from './auth/auth.service';
import { open, seal } from './auth/secretbox';
import { DataService } from './data.service';
import type { Principal } from './db/db';
import { CLOCK } from './weather/tokens';

export const DEVICE_BROKER = Symbol('DEVICE_BROKER');
const SERVER_USER = 'tp-server';
/** Cihazdan bu süre içinde haber alındıysa "çevrimiçi" sayılır (cihaz dakikada bir durum yollar). */
export const ONLINE_WINDOW_MS = 150_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CommandRow {
  id: string;
  deviceId: string;
  action: 'open' | 'close';
  minutes: number | null;
  status: CommandDto['status'];
  reason: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  sentAt: Date | string | null;
  ackedAt: Date | string | null;
  latencyMs: number | null;
}

const COMMAND_COLS = `id, device_id AS "deviceId", action, minutes, status, reason,
  created_at AS "createdAt", expires_at AS "expiresAt", sent_at AS "sentAt",
  acked_at AS "ackedAt", latency_ms AS "latencyMs"`;

const iso = (v: Date | string | null): string | null =>
  v === null ? null : new Date(v).toISOString();

function toDto(r: CommandRow): CommandDto {
  return {
    ...r,
    createdAt: iso(r.createdAt)!,
    expiresAt: iso(r.expiresAt)!,
    sentAt: iso(r.sentAt),
    ackedAt: iso(r.ackedAt),
  };
}

/**
 * Sulama komut hattı: yetki (RLS) > idempotent kayıt > imzalı yayın > cihaz onayı (ack) > durum.
 * Cihaz tarafındaki sert sınırlar (30 dk, TTL, imza) bu hattan bağımsız çalışır.
 */
@Injectable()
export class IrrigationService implements OnModuleInit, OnModuleDestroy {
  private bus: BusClient | null = null;
  private readonly serverPass = randomBytes(24).toString('hex');
  private unsub: Array<() => void> = [];

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(DEVICE_BROKER) private readonly broker: InMemoryBroker,
    @Inject(AUTH_CONFIG) private readonly auth: AuthConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.broker.addServer(SERVER_USER, this.serverPass);
    // Kayıtlı cihazların kimliği (aracı yeniden başlamış olabilir).
    const secrets = await this.data.system((q) =>
      q.query<{ device_id: string; secret: string }>(
        'SELECT device_id, secret FROM device_secrets',
      ),
    );
    for (const s of secrets) {
      this.broker.addDevice(s.device_id, mqttPasswordFor(open(this.auth.encKey, s.secret)));
    }
    this.bus = this.broker.connect(SERVER_USER, this.serverPass, { persistent: true });
    this.unsub.push(
      await this.bus.subscribe(ALL_ACKS, (t, p) => void this.onAck(t, p).catch(console.error)),
      await this.bus.subscribe(ALL_STATES, (t, p) => void this.onState(t, p).catch(console.error)),
    );
  }

  onModuleDestroy(): void {
    this.unsub.forEach((u) => u());
    this.bus?.disconnect();
  }

  /** Cihaz kimliği üretir (ya da döndürür). Sır yalnız bu yanıtta görünür. */
  async provision(me: Principal, deviceId: string) {
    await this.data.runOne(me, 'devices.provision', deviceId, async (q) => {
      const [d] = await q.query<{ id: string }>(
        `SELECT id FROM devices WHERE id = $1 AND can_access_field(field_id, 'write')`,
        [deviceId],
      );
      if (d)
        await q.query('SELECT write_audit($1, $2, $3, $4)', [
          'device.provision',
          'devices',
          deviceId,
          '{}',
        ]);
      return d;
    });
    const secret = randomBytes(32).toString('hex');
    await this.data.system((q) =>
      q.query(
        `INSERT INTO device_secrets(device_id, secret) VALUES ($1, $2)
         ON CONFLICT (device_id) DO UPDATE SET secret = EXCLUDED.secret, created_at = now()`,
        [deviceId, seal(this.auth.encKey, secret)],
      ),
    );
    this.broker.removeUser(deviceId); // eski kimlik düşer; yenisi tanımlanır
    this.broker.addDevice(deviceId, mqttPasswordFor(secret));
    return { deviceId, mqttUser: deviceId, secret };
  }

  /**
   * Komut kabulü. Yetki yoksa 403 (ve `access.denied` denetim satırı). Aynı idempotency anahtarı
   * aynı komutu döndürür, ikinci kez göndermez; içeriği farklıysa 409.
   */
  async command(me: Principal, deviceId: string, body: CommandCreate): Promise<CommandDto> {
    const minutes =
      body.action === 'open' ? Math.min(body.minutes ?? 0, MAX_IRRIGATION_MINUTES) : null;
    const created = this.now();
    const expires = new Date(created.getTime() + DEFAULT_COMMAND_TTL_MS);

    const { row, fresh } = await this.data.runOne(me, 'irrigation.command', deviceId, async (q) => {
      // Yetki: cihazın tarlasına yazma izni. Yoksa satır görünmez (RLS) ya da koşul sağlanmaz.
      const [dev] = await q.query<{ id: string; field_id: string }>(
        `SELECT id, field_id FROM devices WHERE id = $1 AND can_access_field(field_id, 'write')`,
        [deviceId],
      );
      if (!dev) return undefined;

      const [same] = await q.query<CommandRow>(
        `SELECT ${COMMAND_COLS} FROM irrigation_commands WHERE user_id = $1 AND idempotency_key = $2`,
        [me.userId, body.idempotencyKey],
      );
      if (same) {
        if (same.deviceId !== deviceId || same.action !== body.action || same.minutes !== minutes) {
          throw new ConflictException('Bu anahtar başka bir komutla kullanılmış');
        }
        return { row: same, fresh: false };
      }

      if (body.action === 'open') {
        // Yarım kalmış bir komut varken ikinci açma gönderilmez (durdurmak her zaman serbest).
        const [busy] = await q.query<{ id: string }>(
          `SELECT id FROM irrigation_commands
           WHERE device_id = $1 AND status IN ('pending', 'sent') AND expires_at > $2 LIMIT 1`,
          [deviceId, created.toISOString()],
        );
        if (busy) throw new ConflictException('Önceki komut henüz tamamlanmadı');
      }

      const [ins] = await q.query<CommandRow>(
        `INSERT INTO irrigation_commands
           (id, device_id, field_id, user_id, action, minutes, idempotency_key, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${COMMAND_COLS}`,
        [
          randomUUID(),
          deviceId,
          dev.field_id,
          me.userId,
          body.action,
          minutes,
          body.idempotencyKey,
          created.toISOString(),
          expires.toISOString(),
        ],
      );
      return { row: ins!, fresh: true };
    });

    if (!fresh) return toDto(row);
    return toDto(await this.dispatch(row, expires));
  }

  private async dispatch(row: CommandRow, expires: Date): Promise<CommandRow> {
    const [sec] = await this.data.system((q) =>
      q.query<{ secret: string }>('SELECT secret FROM device_secrets WHERE device_id = $1', [
        row.deviceId,
      ]),
    );
    if (!sec) return this.finish(row.id, 'failed', 'cihaz-kurulmamis');
    const msg = signCommand(open(this.auth.encKey, sec.secret), {
      v: 1,
      id: row.id,
      deviceId: row.deviceId,
      action: row.action,
      minutes: row.minutes ?? 0,
      issuedAt: new Date(row.createdAt).getTime(),
      expiresAt: expires.getTime(),
    });
    try {
      await this.bus!.publish(cmdTopic(row.deviceId), JSON.stringify(msg));
    } catch {
      return this.finish(row.id, 'failed', 'yayin-hatasi');
    }
    // Cihaz çok hızlı onaylamış olabilir: durumu yalnız hâlâ 'pending' ise ilerlet.
    const [r] = await this.data.system((q) =>
      q.query<CommandRow>(
        `UPDATE irrigation_commands SET status = 'sent', sent_at = $2 WHERE id = $1 AND status = 'pending'
         RETURNING ${COMMAND_COLS}`,
        [row.id, this.now().toISOString()],
      ),
    );
    return r ?? (await this.load(row.id));
  }

  private async finish(
    id: string,
    status: CommandDto['status'],
    reason: string,
  ): Promise<CommandRow> {
    const [r] = await this.data.system((q) =>
      q.query<CommandRow>(
        `UPDATE irrigation_commands SET status = $2, reason = $3 WHERE id = $1 RETURNING ${COMMAND_COLS}`,
        [id, status, reason],
      ),
    );
    return r!;
  }

  private async load(id: string): Promise<CommandRow> {
    const [r] = await this.data.system((q) =>
      q.query<CommandRow>(`SELECT ${COMMAND_COLS} FROM irrigation_commands WHERE id = $1`, [id]),
    );
    return r!;
  }

  /** Cihazdan ack: yalnız o cihazın kendi komutu, yalnız bekleyen durumdaki komut için işlenir. */
  private async onAck(topic: string, payload: string): Promise<void> {
    const deviceId = topic.split('/')[2] ?? '';
    let ack: AckMsg;
    try {
      ack = JSON.parse(payload) as AckMsg;
    } catch {
      return;
    }
    if (!UUID.test(deviceId) || !UUID.test(ack.commandId ?? '') || ack.deviceId !== deviceId)
      return;
    const at = this.now();
    const status = ack.status === 'accepted' ? 'acked' : 'rejected';
    await this.data.system(async (q) => {
      // 'expired' da kabul: TTL sunucuda dolmuş ama cihaz süre içinde kabul etmiş olabilir; gerçek durum cihazdadır.
      await q.query(
        `UPDATE irrigation_commands
         SET status = $3, reason = $4, acked_at = $5,
             latency_ms = GREATEST(0, round(extract(epoch FROM ($5::timestamptz - created_at)) * 1000))::int
         WHERE id = $1 AND device_id = $2 AND status IN ('pending', 'sent', 'expired')`,
        [
          ack.commandId,
          deviceId,
          status,
          ack.status === 'rejected' ? (ack.reason ?? 'reddedildi') : null,
          at.toISOString(),
        ],
      );
      await this.saveState(q, deviceId, ack.valveOpen, ack.closesAt, 'command', at);
    });
  }

  private async onState(topic: string, payload: string): Promise<void> {
    const deviceId = topic.split('/')[2] ?? '';
    let st: StateMsg;
    try {
      st = JSON.parse(payload) as StateMsg;
    } catch {
      return;
    }
    if (!UUID.test(deviceId) || st.deviceId !== deviceId) return;
    await this.data.system((q) =>
      this.saveState(q, deviceId, st.valveOpen, st.closesAt, st.reason, this.now()),
    );
  }

  private async saveState(
    q: Parameters<Parameters<DataService['system']>[0]>[0],
    deviceId: string,
    valveOpen: boolean,
    closesAt: number | null,
    reason: string,
    at: Date,
  ): Promise<void> {
    await q.query(
      `INSERT INTO device_state(device_id, valve_open, closes_at, last_seen_at, last_reason)
       SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM devices WHERE id = $1)
       ON CONFLICT (device_id) DO UPDATE SET valve_open = EXCLUDED.valve_open,
         closes_at = EXCLUDED.closes_at, last_seen_at = EXCLUDED.last_seen_at, last_reason = EXCLUDED.last_reason`,
      [
        deviceId,
        valveOpen,
        closesAt === null ? null : new Date(closesAt).toISOString(),
        at.toISOString(),
        reason,
      ],
    );
  }

  /** TTL'i dolup ack gelmemiş komutları 'expired' yapar. */
  private async expireStale(): Promise<void> {
    await this.data.system((q) =>
      q.query(
        `UPDATE irrigation_commands SET status = 'expired', reason = 'zaman-asimi'
         WHERE status IN ('pending', 'sent') AND expires_at < $1`,
        [this.now().toISOString()],
      ),
    );
  }

  async status(me: Principal, deviceId: string): Promise<DeviceStatusDto> {
    await this.expireStale();
    const now = this.now();
    const dto = await this.data.runOne(me, 'irrigation.status', deviceId, async (q) => {
      const [d] = await q.query<{ id: string; fieldId: string; name: string }>(
        `SELECT id, field_id AS "fieldId", name FROM devices WHERE id = $1`,
        [deviceId],
      );
      if (!d) return undefined;
      const [st] = await q.query<{
        valveOpen: boolean;
        closesAt: Date | string | null;
        lastSeenAt: Date | string;
      }>(
        `SELECT valve_open AS "valveOpen", closes_at AS "closesAt", last_seen_at AS "lastSeenAt"
         FROM device_state WHERE device_id = $1`,
        [deviceId],
      );
      const [last] = await q.query<CommandRow>(
        `SELECT ${COMMAND_COLS} FROM irrigation_commands WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [deviceId],
      );
      const [run] = await q.query<{ at: Date | string; minutes: number }>(
        `SELECT acked_at AS at, minutes FROM irrigation_commands
         WHERE device_id = $1 AND action = 'open' AND status = 'acked' ORDER BY created_at DESC LIMIT 1`,
        [deviceId],
      );
      const seen = st ? new Date(st.lastSeenAt) : null;
      // Süre dolmuş ama kapanış haberi gelmemişse açık demek yanıltıcı olur: bilinmiyor sayılır.
      const closes = st?.closesAt ? new Date(st.closesAt) : null;
      const stale = st?.valveOpen && closes !== null && closes.getTime() < now.getTime();
      return {
        deviceId: d.id,
        fieldId: d.fieldId,
        name: d.name,
        valveOpen: st ? (stale ? false : st.valveOpen) : null,
        closesAt: stale ? null : iso(closes),
        lastSeenAt: iso(seen),
        online: seen !== null && now.getTime() - seen.getTime() <= ONLINE_WINDOW_MS,
        provisioned: false,
        lastCommand: last ? toDto(last) : null,
        lastRun: run ? { at: iso(run.at)!, minutes: run.minutes } : null,
      } satisfies DeviceStatusDto;
    });
    // İç içe işlem açılmaz (tek bağlantılı veritabanlarında kilitlenir): sır varlığı yetki sonrası sorulur.
    const known = await this.data.system((q) =>
      q.query('SELECT 1 FROM device_secrets WHERE device_id = $1', [deviceId]),
    );
    return { ...dto, provisioned: known.length > 0 };
  }

  async getCommand(me: Principal, id: string): Promise<CommandDto> {
    await this.expireStale();
    const row = await this.data.runOne(me, 'irrigation.command.get', id, async (q) => {
      const [r] = await q.query<CommandRow>(
        `SELECT ${COMMAND_COLS} FROM irrigation_commands WHERE id = $1`,
        [id],
      );
      return r;
    });
    return toDto(row);
  }

  /** Yönetici raporu: onaylanmış komutların gecikme dağılımı (ms). */
  async latency() {
    const [r] = await this.data.system((q) =>
      q.query<{ n: string; p50: number | null; p95: number | null; max: number | null }>(
        `SELECT count(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
           max(latency_ms) AS max
         FROM irrigation_commands WHERE latency_ms IS NOT NULL`,
      ),
    );
    return {
      count: Number(r?.n ?? 0),
      p50Ms: r?.p50 ?? null,
      p95Ms: r?.p95 ?? null,
      maxMs: r?.max ?? null,
    };
  }
}
