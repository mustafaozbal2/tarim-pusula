import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { base32Decode, hotp, totpStep } from './auth/totp';
import { importCropCatalog } from './crops';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { Places } from './places';

const db = createTestDb();
const sms = new FakeSmsProvider();
let app: INestApplication;
let base: string;

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
const grant = (userId: string, role: string) =>
  sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [userId, role]);
const codeFor = (secret: string, stepOffset = 0) =>
  hotp(base32Decode(secret), totpStep(new Date()) + stepOffset);

/** Telefon + TOTP ile tam panel girişi. */
async function panelLogin(phone: string, role: string) {
  const u = await login(phone);
  await grant(u.userId, role);
  const e = await call('POST', '/panel/mfa/enroll', u.token);
  expect(e.status).toBe(200);
  const v = await call('POST', '/panel/mfa/verify', u.token, { code: codeFor(e.body.secret) });
  expect(v.status).toBe(200);
  return { ...u, secret: e.body.secret as string };
}

let inst: Awaited<ReturnType<typeof panelLogin>>;
let expert: Awaited<ReturnType<typeof panelLogin>>;
let expert2: Awaited<ReturnType<typeof panelLogin>>;
let admin: Awaited<ReturnType<typeof panelLogin>>;
let farmer: Awaited<ReturnType<typeof login>>;
let pistachioPack: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({ db, sms, auth: { otpSecret: 'test' }, places: Places.load() }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  farmer = await login('+905321130001');
  inst = await panelLogin('+905321130002', 'institution_admin');
  expert = await panelLogin('+905321130003', 'expert');
  expert2 = await panelLogin('+905321130004', 'expert');
  admin = await panelLogin('+905321130005', 'admin');
  const [p] = await sql<{ id: string }>(
    "SELECT id FROM crop_pack_versions WHERE crop_id = 'antep-fistigi' ORDER BY version DESC LIMIT 1",
  );
  pistachioPack = p!.id;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('panel girişi (ikinci adım)', () => {
  it('çiftçi ikinci adımı kuramaz ve panele giremez', async () => {
    expect((await call('POST', '/panel/mfa/enroll', farmer.token)).status).toBe(403);
    expect((await call('GET', '/panel/me', farmer.token)).status).toBe(403);
    expect((await call('GET', '/panel/review-queue', farmer.token)).status).toBe(403);
  });

  it('giriş yapmayan 401', async () => {
    expect((await call('GET', '/panel/me')).status).toBe(401);
  });

  it('yalnız telefon girişi yetmez: ikinci adım yoksa 403', async () => {
    const u = await login('+905321130010');
    await grant(u.userId, 'expert');
    expect((await call('GET', '/panel/me', u.token)).status).toBe(403);
    expect((await call('POST', '/announcements', u.token, {})).status).toBe(403);
    const st = await call('GET', '/panel/mfa', u.token);
    expect(st.body).toEqual({ enrolled: false, verified: false });
  });

  it('yanlış kod reddedilir, 5 hatadan sonra kilitlenir; kilitliyken doğru kod da geçmez', async () => {
    const u = await login('+905321130011');
    await grant(u.userId, 'expert');
    const e = await call('POST', '/panel/mfa/enroll', u.token);
    const good = codeFor(e.body.secret);
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await call('POST', '/panel/mfa/verify', u.token, { code: bad })).status).toBe(401);
    }
    expect((await call('POST', '/panel/mfa/verify', u.token, { code: good })).status).toBe(429);
    expect((await call('GET', '/panel/me', u.token)).status).toBe(403);
  });

  it('aynı kod tekrar kullanılamaz; onaylı kurulum yeniden başlatılamaz', async () => {
    const again = await login('+905321130003'); // uzmanın yeni oturumu (ikinci adım yok)
    expect((await call('POST', '/panel/mfa/enroll', again.token)).status).toBe(409);
    // panelLogin'de kullanılan adım (ya da öncesi) tekrar kabul edilmez.
    const used = await call('POST', '/panel/mfa/verify', again.token, {
      code: codeFor(expert.secret),
    });
    expect(used.status).toBe(401);
    // Sonraki adımın kodu (tolerans +1) kabul edilir.
    const next = await call('POST', '/panel/mfa/verify', again.token, {
      code: codeFor(expert.secret, 1),
    });
    expect(next.status).toBe(200);
    expect((await call('GET', '/panel/me', again.token)).status).toBe(200);
  });

  it('menü role göre gelir', async () => {
    const paths = async (t: string) =>
      ((await call('GET', '/panel/me', t)).body.menu as { path: string }[]).map((m) => m.path);
    const inst_ = await paths(inst.token);
    expect(inst_).toContain('/duyurular');
    expect(inst_).not.toContain('/onay');
    expect(inst_).not.toContain('/paketler');
    expect(inst_).not.toContain('/denetim');
    const exp_ = await paths(expert.token);
    expect(exp_).toEqual(expect.arrayContaining(['/duyurular', '/onay', '/paketler']));
    expect(exp_).not.toContain('/denetim');
    expect(await paths(admin.token)).toContain('/denetim');
  });
});

describe('rol sınırları', () => {
  it('kurum yöneticisi onay kuyruğunu ve paketleri göremez, onaylayamaz', async () => {
    expect((await call('GET', '/panel/review-queue', inst.token)).status).toBe(403);
    expect((await call('GET', '/panel/packs', inst.token)).status).toBe(403);
    expect((await call('POST', `/panel/packs/${pistachioPack}/approve`, inst.token)).status).toBe(
      403,
    );
    expect(
      (
        await call('POST', `/panel/packs/${pistachioPack}/stages`, inst.token, {
          nameTr: 'Çiçeklenme',
          frostCriticalC: -2,
          source: 'Kaynak',
        })
      ).status,
    ).toBe(403);
  });

  it('veritabanı da korur: yetkisiz rol işlevi doğrudan çağırsa bile reddedilir', async () => {
    await expect(
      systemTx(db, async (q) => {
        await q.query("SELECT set_config('app.user_id', $1, true)", [farmer.userId]);
        await q.exec('SET LOCAL ROLE tp_app');
        await q.query('SELECT review_crop_pack($1)', [pistachioPack]);
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('duyuru yazma > onay > yayın', () => {
  const ann = {
    sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
    title: 'Panel duyurusu',
    body: 'Deneme.',
    publishedAt: '2026-01-01T00:00:00Z',
    targeting: { places: [{ province: 'Gaziantep' }], circle: null, cropIds: [] },
  };

  it('kurum yazar (taslak), uzman kuyruktan onaylar, denetim izi kalır', async () => {
    const c = await call('POST', '/announcements', inst.token, ann);
    expect(c.status).toBe(201);
    const id = c.body.id as string;

    const q1 = await call('GET', '/panel/review-queue', expert.token);
    expect(q1.body.announcements.map((a: { id: string }) => a.id)).toContain(id);

    // Kurum yöneticisi kendi duyurusunu onaylayamaz.
    expect((await call('POST', `/announcements/${id}/approve`, inst.token)).status).toBe(403);
    expect((await call('POST', `/announcements/${id}/approve`, expert.token)).status).toBe(200);

    const q2 = await call('GET', '/panel/review-queue', expert.token);
    expect(q2.body.announcements.map((a: { id: string }) => a.id)).not.toContain(id);

    const actions = await sql<{ action: string }>(
      "SELECT action FROM audit_log WHERE entity_id = $1 AND entity = 'announcements'",
      [id],
    );
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['insert.announcements', 'update.announcements']),
    );
    const [ok] = await sql<{ bad: string | null }>('SELECT verify_audit_chain()::text AS bad');
    expect(ok!.bad).toBeNull();
  });
});

describe('bitki paketi onayı', () => {
  it('paket taslak başlar; uzman onaylar; ikinci onay 404; denetimde görünür', async () => {
    const q = await call('GET', '/panel/review-queue', expert.token);
    expect(q.body.packs.map((p: { packId: string }) => p.packId)).toContain(pistachioPack);
    expect((await call('POST', `/panel/packs/${pistachioPack}/approve`, expert.token)).status).toBe(
      200,
    );
    expect((await call('POST', `/panel/packs/${pistachioPack}/approve`, expert.token)).status).toBe(
      404,
    );
    const [row] = await sql<{ review_status: string }>(
      'SELECT review_status FROM crop_pack_versions WHERE id = $1',
      [pistachioPack],
    );
    expect(row!.review_status).toBe('uzman-onayli');
    const audit = await sql<{ action: string }>(
      "SELECT action FROM audit_log WHERE action = 'panel.crop_pack.approve' AND entity_id = $1",
      [pistachioPack],
    );
    expect(audit).toHaveLength(1);
  });

  it('evre: kaynak zorunlu; giren onaylayamaz, başka uzman onaylar', async () => {
    const noSource = await call('POST', `/panel/packs/${pistachioPack}/stages`, expert.token, {
      nameTr: 'Çiçeklenme',
      frostCriticalC: -2,
      source: '',
    });
    expect(noSource.status).toBe(400);

    const add = await call('POST', `/panel/packs/${pistachioPack}/stages`, expert.token, {
      nameTr: 'Çiçeklenme',
      frostCriticalC: -2,
      source: 'Test kaynağı (uzman girişi)',
    });
    expect(add.status).toBe(201);
    const seq = add.body.seq as number;
    expect(add.body.reviewStatus).toBe('taslak-uzman-onayi-bekliyor');

    const url = `/panel/packs/${pistachioPack}/stages/${seq}/approve`;
    expect((await call('POST', url, expert.token)).status).toBe(403);
    expect((await call('POST', url, expert2.token)).status).toBe(200);
    expect((await call('POST', url, expert2.token)).status).toBe(404);
    const [s] = await sql<{ review_status: string; entered_by: string }>(
      'SELECT review_status, entered_by FROM crop_stages WHERE pack_id = $1 AND seq = $2',
      [pistachioPack, seq],
    );
    expect(s).toEqual({ review_status: 'uzman-onayli', entered_by: expert.userId });
  });

  it('uygulama rolü pakete doğrudan yazamaz', async () => {
    await expect(
      systemTx(db, async (q) => {
        await q.query("SELECT set_config('app.user_id', $1, true)", [expert.userId]);
        await q.exec('SET LOCAL ROLE tp_app');
        await q.query("UPDATE crop_pack_versions SET review_status = 'uzman-onayli'");
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('denetim kaydı yalnız yönetici; zincir sağlam', async () => {
    expect((await call('GET', '/admin/audit', expert.token)).status).toBe(403);
    expect((await call('GET', '/admin/audit', admin.token)).status).toBe(200);
    const v = await call('GET', '/admin/audit/verify', admin.token);
    expect(v.body).toEqual({ ok: true, firstBrokenSeq: null });
  });
});
