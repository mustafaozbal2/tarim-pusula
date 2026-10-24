import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InMemoryBroker, VirtualDevice, mqttPasswordFor } from '@tarim/device-sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { Places } from './places';

const db = createTestDb();
const sms = new FakeSmsProvider();
const broker = new InMemoryBroker();
let app: INestApplication;
let base: string;
/** Test saati: sunucu ve sanal cihaz aynı kaymayı görür (TTL testi için ileri sarılır). */
let skewMs = 0;
const clockNow = () => Date.now() + skewMs;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as any) : undefined }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function login(phone: string) {
  await call('POST', '/auth/otp/request', undefined, { phone });
  const r = await call('POST', '/auth/otp/verify', undefined, { phone, code: sms.lastCode(phone) });
  return r.body as { token: string; userId: string };
}
const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  systemTx(db, (q) => q.query<T>(text, params));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | undefined | false>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('zaman aşımı');
    await sleep(15);
  }
}
let key = 0;
const idem = () => `anahtar-${Date.now()}-${++key}`;

let ali: Awaited<ReturnType<typeof login>>; // sahip
let veli: Awaited<ReturnType<typeof login>>; // yabancı
let reader: Awaited<ReturnType<typeof login>>; // yalnız okuma
let writer: Awaited<ReturnType<typeof login>>; // yazma izinli
let admin: Awaited<ReturnType<typeof login>>;
let fieldId: string;
let deviceId: string;
let dev: VirtualDevice;

async function newDevice(owner: { token: string }, field: string, name: string) {
  const d = await call('POST', '/devices', owner.token, { fieldId: field, name });
  expect(d.status).toBe(201);
  const p = await call('POST', `/devices/${d.body.id}/provision`, owner.token);
  expect(p.status).toBe(201);
  const device = new VirtualDevice({
    id: d.body.id,
    secret: p.body.secret,
    broker,
    clock: {
      now: clockNow,
      setTimeout: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    },
  });
  await device.connect();
  return { id: d.body.id as string, device, secret: p.body.secret as string };
}

beforeAll(async () => {
  await migrate(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      places: Places.load(),
      broker,
      now: () => new Date(clockNow()),
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login('+905321180001');
  veli = await login('+905321180002');
  reader = await login('+905321180003');
  writer = await login('+905321180004');
  admin = await login('+905321180005');
  await sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
    admin.userId,
    'admin',
  ]);
  const f = await call('POST', '/fields', ali.token, {
    name: 'Burç Köyü Fıstık',
    lat: 37.1,
    lon: 37.4,
  });
  fieldId = f.body.id;
  await call('POST', `/fields/${fieldId}/access`, ali.token, {
    userId: reader.userId,
    level: 'read',
  });
  await call('POST', `/fields/${fieldId}/access`, ali.token, {
    userId: writer.userId,
    level: 'write',
  });
  const d = await newDevice(ali, fieldId, 'Vana 1');
  deviceId = d.id;
  dev = d.device;
});
afterAll(async () => {
  dev.disconnect();
  await app.close();
  await db.close();
});

const open = (token: string, id = deviceId, minutes = 10, k = idem()) =>
  call('POST', `/devices/${id}/commands`, token, { action: 'open', minutes, idempotencyKey: k });
const commandRows = (id = deviceId) =>
  sql<{ n: string }>('SELECT count(*) AS n FROM irrigation_commands WHERE device_id = $1', [id]);

describe('yetki: başkası başkasının vanasını açamaz', () => {
  it('yabancı kullanıcının komutu 403; vana açılmaz, komut kaydı oluşmaz, denetim satırı düşer', async () => {
    const before = Number((await commandRows())[0]!.n);
    const r = await open(veli.token);
    expect(r.status).toBe(403);
    expect(dev.valveOpen).toBe(false);
    expect(Number((await commandRows())[0]!.n)).toBe(before);
    const audit = await sql(
      "SELECT 1 FROM audit_log WHERE action = 'access.denied' AND actor_id = $1 AND entity = 'irrigation.command'",
      [veli.userId],
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it('yabancı durum okuyamaz, kimlik üretemez, başkasının komutunu göremez (403)', async () => {
    expect((await call('GET', `/devices/${deviceId}/status`, veli.token)).status).toBe(403);
    expect((await call('POST', `/devices/${deviceId}/provision`, veli.token)).status).toBe(403);
    const mine = await open(ali.token, deviceId, 1);
    expect((await call('GET', `/commands/${mine.body.id}`, veli.token)).status).toBe(403);
    await call('POST', `/devices/${deviceId}/commands`, ali.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
  });

  it('yalnız okuma izni olan durumu görür ama komut veremez, kimlik üretemez (403)', async () => {
    expect((await call('GET', `/devices/${deviceId}/status`, reader.token)).status).toBe(200);
    expect((await open(reader.token)).status).toBe(403);
    expect((await call('POST', `/devices/${deviceId}/provision`, reader.token)).status).toBe(403);
  });

  it('yönetici rolü bile başkasının vanasını açamaz (403)', async () => {
    expect((await open(admin.token)).status).toBe(403);
  });

  it('girişsiz komut 401', async () => {
    expect((await call('POST', `/devices/${deviceId}/commands`, undefined, {})).status).toBe(401);
  });

  it('geçersiz cihaz kimliği 403 (varlık sızdırılmaz)', async () => {
    expect((await open(ali.token, 'abc')).status).toBe(403);
    expect((await open(ali.token, '00000000-0000-4000-8000-000000000000')).status).toBe(403);
  });

  it('yazma izni olan paylaşımlı kullanıcı komut verebilir', async () => {
    const r = await open(writer.token, deviceId, 1);
    expect(r.status).toBe(202);
    await until(
      async () =>
        (await call('GET', `/commands/${r.body.id}`, writer.token)).body.status === 'acked',
    );
    await call('POST', `/devices/${deviceId}/commands`, writer.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
  });

  it('izin geri alınınca komut yeniden 403', async () => {
    await call('DELETE', `/fields/${fieldId}/access/${writer.userId}`, ali.token);
    expect((await open(writer.token)).status).toBe(403);
  });

  it('başka cihaz kimliğiyle gelen ack, başkasının komutunu etkilemez', async () => {
    const other = await newDevice(ali, fieldId, 'Vana 2');
    const c = await open(ali.token, deviceId, 10);
    // Vana 2 (ele geçirilmiş gibi), Vana 1'in komutu için kendi konusundan ack yayınlar.
    const spoof = broker.connect(other.id, mqttPasswordFor(other.secret));
    await spoof.publish(
      `tp/dev/${other.id}/ack`,
      JSON.stringify({
        v: 1,
        commandId: c.body.id,
        deviceId: other.id,
        status: 'rejected',
        reason: 'x',
        at: 1,
        valveOpen: false,
        closesAt: null,
      }),
    );
    await sleep(60);
    const real = await call('GET', `/commands/${c.body.id}`, ali.token);
    expect(real.body.status).toBe('acked'); // gerçek cihazın cevabı; sahte ack onu bozmadı
    expect(real.body.reason).toBeNull();
    await call('POST', `/devices/${deviceId}/commands`, ali.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
  });
});

describe('komut hattı: açma, ack, durdurma', () => {
  it('sahip vanayı açar; ack gelir; gecikme ölçülür; durum açık; durdurunca kapanır', async () => {
    const r = await open(ali.token, deviceId, 20);
    expect(r.status).toBe(202);
    expect(r.body.minutes).toBe(20);
    const done = await until(async () => {
      const c = (await call('GET', `/commands/${r.body.id}`, ali.token)).body;
      return c.status === 'acked' ? c : false;
    });
    expect(done.latencyMs).toBeGreaterThanOrEqual(0);
    expect(done.latencyMs).toBeLessThan(2000);
    expect(done.ackedAt).toBeTruthy();
    expect(dev.valveOpen).toBe(true);

    const st = (await call('GET', `/devices/${deviceId}/status`, ali.token)).body;
    expect(st).toMatchObject({ valveOpen: true, online: true, provisioned: true });
    expect(new Date(st.closesAt).getTime() - clockNow()).toBeLessThanOrEqual(20 * 60_000);
    expect(st.lastCommand.id).toBe(r.body.id);

    const stop = await call('POST', `/devices/${deviceId}/commands`, ali.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
    expect(stop.status).toBe(202);
    await until(
      async () =>
        (await call('GET', `/devices/${deviceId}/status`, ali.token)).body.valveOpen === false,
    );
    expect(dev.valveOpen).toBe(false);
    const after = (await call('GET', `/devices/${deviceId}/status`, ali.token)).body;
    expect(after.lastRun).toMatchObject({ minutes: 20 });
  });

  it('aynı idempotency anahtarı aynı komutu döndürür, ikinci kez göndermez', async () => {
    const k = idem();
    const a = await open(ali.token, deviceId, 5, k);
    await until(
      async () => (await call('GET', `/commands/${a.body.id}`, ali.token)).body.status === 'acked',
    );
    const rowsBefore = Number((await commandRows())[0]!.n);
    const b = await open(ali.token, deviceId, 5, k);
    expect(b.status).toBe(202);
    expect(b.body.id).toBe(a.body.id);
    expect(Number((await commandRows())[0]!.n)).toBe(rowsBefore);
    const clash = await open(ali.token, deviceId, 15, k);
    expect(clash.status).toBe(409); // aynı anahtar, farklı içerik
    await call('POST', `/devices/${deviceId}/commands`, ali.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
  });

  it('önceki komut sürerken ikinci "aç" 409; "durdur" her zaman serbest', async () => {
    dev.disconnect(); // ack gelmeyecek
    const a = await open(ali.token, deviceId, 5);
    expect(a.status).toBe(202);
    expect((await open(ali.token, deviceId, 5)).status).toBe(409);
    const stop = await call('POST', `/devices/${deviceId}/commands`, ali.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
    expect(stop.status).toBe(202);
    await dev.connect(); // kuyruktaki komutlar sırayla işlenir: aç, sonra durdur
    await until(
      async () =>
        (await call('GET', `/commands/${stop.body.id}`, ali.token)).body.status === 'acked',
    );
    expect(dev.valveOpen).toBe(false);
  });

  it('süre sınırı: 31 dakika, 0, ondalık, süresiz "aç" 400', async () => {
    for (const minutes of [31, 0, 2.5, undefined]) {
      const r = await call('POST', `/devices/${deviceId}/commands`, ali.token, {
        action: 'open',
        minutes,
        idempotencyKey: idem(),
      });
      expect(r.status).toBe(400);
    }
    expect(
      (
        await call('POST', `/devices/${deviceId}/commands`, ali.token, {
          action: 'open',
          minutes: 5,
          idempotencyKey: 'k',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', `/devices/${deviceId}/commands`, ali.token, {
          action: 'patlat',
          idempotencyKey: idem(),
        })
      ).status,
    ).toBe(400);
  });

  it('komut içeriği veritabanında sonradan değiştirilemez', async () => {
    const r = await open(ali.token, deviceId, 3);
    await expect(
      sql('UPDATE irrigation_commands SET minutes = 30 WHERE id = $1', [r.body.id]),
    ).rejects.toThrow();
    await call('POST', `/devices/${deviceId}/commands`, ali.token, {
      action: 'close',
      idempotencyKey: idem(),
    });
  });

  it('komut ve ack işlemleri denetim kaydına düşer', async () => {
    const rows = await sql<{ action: string }>(
      "SELECT action FROM audit_log WHERE entity = 'irrigation_commands' AND action IN ('insert.irrigation_commands','update.irrigation_commands')",
    );
    expect(rows.some((x) => x.action === 'insert.irrigation_commands')).toBe(true);
    expect(rows.some((x) => x.action === 'update.irrigation_commands')).toBe(true);
  });
});

describe('dayanıklılık', () => {
  it('kurulmamış cihaza komut: kayıt oluşur ama "başarısız / cihaz kurulmamış" olur', async () => {
    const d = await call('POST', '/devices', ali.token, { fieldId, name: 'Boş vana' });
    const r = await open(ali.token, d.body.id, 5);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'failed', reason: 'cihaz-kurulmamis' });
    const st = await call('GET', `/devices/${d.body.id}/status`, ali.token);
    expect(st.body).toMatchObject({ provisioned: false, online: false, valveOpen: null });
  });

  it('cihaz çevrimdışıyken verilen komut zaman aşımına uğrar; geç gelince cihaz da reddeder', async () => {
    dev.disconnect();
    const c = await open(ali.token, deviceId, 10);
    skewMs += 200_000; // TTL (60 sn) ve çevrimiçi penceresi (150 sn) geçti
    const st = await call('GET', `/devices/${deviceId}/status`, ali.token);
    expect(st.body.lastCommand).toMatchObject({ id: c.body.id, status: 'expired' });
    expect(st.body.online).toBe(false);
    await dev.connect();
    const final = await until(async () => {
      const x = (await call('GET', `/commands/${c.body.id}`, ali.token)).body;
      return x.status === 'rejected' ? x : false;
    });
    expect(final.reason).toBe('expired');
    expect(dev.valveOpen).toBe(false); // geç gelen komutla vana açılmadı
  });

  it('süresi dolmuş "açık" durumu çevrimdışı cihaz için açık diye gösterilmez', async () => {
    const r = await open(ali.token, deviceId, 1);
    await until(
      async () => (await call('GET', `/commands/${r.body.id}`, ali.token)).body.status === 'acked',
    );
    dev.disconnect();
    skewMs += 5 * 60_000; // cihaz 1 dk sonra kapandı ama haber veremedi
    const st = (await call('GET', `/devices/${deviceId}/status`, ali.token)).body;
    expect(st.valveOpen).toBe(false);
    expect(st.online).toBe(false);
    await dev.connect();
  });
});

describe('gecikme raporu', () => {
  it('yönetici gecikme dağılımını görür; çiftçi göremez', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await open(ali.token, deviceId, 1);
      await until(
        async () =>
          (await call('GET', `/commands/${r.body.id}`, ali.token)).body.status === 'acked',
      );
      await call('POST', `/devices/${deviceId}/commands`, ali.token, {
        action: 'close',
        idempotencyKey: idem(),
      });
      await until(async () => !dev.valveOpen);
    }
    const lat = await call('GET', '/admin/irrigation/latency', admin.token);
    expect(lat.status).toBe(200);
    expect(lat.body.count).toBeGreaterThanOrEqual(5);
    expect(lat.body.p95Ms).toBeLessThan(2000);
    expect(lat.body.p50Ms).toBeLessThanOrEqual(lat.body.p95Ms);
    expect((await call('GET', '/admin/irrigation/latency', ali.token)).status).toBe(403);
  });
});
