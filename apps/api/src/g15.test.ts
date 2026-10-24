import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { encKeyFrom, isSealed, open, seal } from './auth/secretbox';
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
let inst2: Awaited<ReturnType<typeof panelLogin>>;
let expert: Awaited<ReturnType<typeof panelLogin>>;
let admin: Awaited<ReturnType<typeof panelLogin>>;
let farmer: Awaited<ReturnType<typeof login>>;
let packId: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({ db, sms, auth: { otpSecret: 'test' }, places: Places.load() }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  farmer = await login('+905321150001');
  inst = await panelLogin('+905321150002', 'institution_admin');
  inst2 = await panelLogin('+905321150003', 'institution_admin');
  expert = await panelLogin('+905321150004', 'expert');
  admin = await panelLogin('+905321150005', 'admin');
  const [p] = await sql<{ id: string }>(
    "SELECT id FROM crop_pack_versions WHERE crop_id = 'antep-fistigi' ORDER BY version DESC LIMIT 1",
  );
  packId = p!.id;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('sır şifreleme (AES-256-GCM)', () => {
  const key = encKeyFrom({ SECRET_ENC_KEY: 'ab'.repeat(32) });

  it('gidiş-dönüş, her seferinde farklı şifreli metin, bozulursa açılmaz', () => {
    const a = seal(key, 'JBSWY3DPEHPK3PXP');
    const b = seal(key, 'JBSWY3DPEHPK3PXP');
    expect(isSealed(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(key, a)).toBe('JBSWY3DPEHPK3PXP');
    const parts = a.split(':');
    parts[3] = Buffer.from('x' + parts[3]).toString('base64url');
    expect(() => open(key, parts.join(':'))).toThrow();
    expect(() => open(Buffer.alloc(32, 1), a)).toThrow();
  });

  it('eski düz metin kayıt okunur', () => {
    expect(open(key, 'DUZMETIN')).toBe('DUZMETIN');
  });

  it('anahtar biçimi denetlenir; üretimde anahtarsız başlamaz', () => {
    expect(() => encKeyFrom({ SECRET_ENC_KEY: 'kisa' })).toThrow(/64 haneli/);
    expect(() => encKeyFrom({ NODE_ENV: 'production' })).toThrow(/SECRET_ENC_KEY/);
    expect(encKeyFrom({}).length).toBe(32);
  });

  it('TOTP sırrı veritabanında şifreli durur ve giriş yine çalışır', async () => {
    const [row] = await sql<{ secret: string }>('SELECT secret FROM user_mfa WHERE user_id = $1', [
      expert.userId,
    ]);
    expect(isSealed(row!.secret)).toBe(true);
    expect(row!.secret).not.toContain(expert.secret);
  });

  it('eski düz metin TOTP sırrı girişte kabul edilir ve şifrelenir', async () => {
    const u = await login('+905321150020');
    await grant(u.userId, 'expert');
    const e = await call('POST', '/panel/mfa/enroll', u.token);
    await sql('UPDATE user_mfa SET secret = $2 WHERE user_id = $1', [u.userId, e.body.secret]);
    const v = await call('POST', '/panel/mfa/verify', u.token, { code: codeFor(e.body.secret) });
    expect(v.status).toBe(200);
    const [row] = await sql<{ secret: string }>('SELECT secret FROM user_mfa WHERE user_id = $1', [
      u.userId,
    ]);
    expect(isSealed(row!.secret)).toBe(true);
  });

  it('cihaz sırrı da şifreli saklanır', async () => {
    const f = await call('POST', '/fields', farmer.token, {
      name: 'Sır tarlası',
      lat: 37.1,
      lon: 37.4,
    });
    const d = await call('POST', '/devices', farmer.token, { fieldId: f.body.id, name: 'Vana' });
    const p = await call('POST', `/devices/${d.body.id}/provision`, farmer.token);
    expect(p.status).toBe(201);
    const [row] = await sql<{ secret: string }>(
      'SELECT secret FROM device_secrets WHERE device_id = $1',
      [d.body.id],
    );
    expect(isSealed(row!.secret)).toBe(true);
    expect(row!.secret).not.toContain(p.body.secret as string);
  });
});

describe('MFA sıfırlama', () => {
  it('yalnız yönetici (ikinci adımı geçmiş) sıfırlar; kendi kaydını sıfırlayamaz', async () => {
    const target = await panelLogin('+905321150030', 'expert');
    const url = `/panel/mfa/reset/${target.userId}`;
    expect((await call('POST', url, farmer.token)).status).toBe(403);
    expect((await call('POST', url, expert.token)).status).toBe(403);
    expect((await call('POST', `/panel/mfa/reset/${admin.userId}`, admin.token)).status).toBe(409);
    expect((await call('POST', '/panel/mfa/reset/abc', admin.token)).status).toBe(400);

    // İkinci adımı geçmemiş yönetici de sıfırlayamaz.
    const weak = await login('+905321150031');
    await grant(weak.userId, 'admin');
    expect((await call('POST', url, weak.token)).status).toBe(403);

    expect((await call('GET', '/panel/me', target.token)).status).toBe(200);
    expect((await call('POST', url, admin.token)).status).toBe(200);
    // Eski oturum ikinci adımı kaybeder.
    expect((await call('GET', '/panel/me', target.token)).status).toBe(403);
    // İkinci sıfırlama: kayıt yok.
    expect((await call('POST', url, admin.token)).status).toBe(404);

    // Yeniden kurulum: yeni sır; eski sırrın kodu geçmez.
    const e = await call('POST', '/panel/mfa/enroll', target.token);
    expect(e.status).toBe(200);
    expect(e.body.secret).not.toBe(target.secret);
    const old = await call('POST', '/panel/mfa/verify', target.token, {
      code: codeFor(target.secret, 1),
    });
    expect(old.status).toBe(401);
    const ok = await call('POST', '/panel/mfa/verify', target.token, {
      code: codeFor(e.body.secret),
    });
    expect(ok.status).toBe(200);
    expect((await call('GET', '/panel/me', target.token)).status).toBe(200);

    const audit = await sql(
      "SELECT 1 FROM audit_log WHERE action = 'auth.mfa.reset' AND entity_id = $1",
      [target.userId],
    );
    expect(audit).toHaveLength(1);
  });
});

describe('paket ve evre: reddetme, onay geri çekme', () => {
  const packStatus = async (id: string) =>
    (
      await sql<{ review_status: string }>(
        'SELECT review_status FROM crop_pack_versions WHERE id=$1',
        [id],
      )
    )[0]!.review_status;
  const stageStatus = async (seq: number) =>
    (
      await sql<{ review_status: string }>(
        'SELECT review_status FROM crop_stages WHERE pack_id=$1 AND seq=$2',
        [packId, seq],
      )
    )[0]!.review_status;

  it('gerekçe zorunlu, yalnız uzman/yönetici; reddedilen paket onaylanamaz', async () => {
    const url = `/panel/packs/${packId}/reject`;
    expect((await call('POST', url, expert.token, {})).status).toBe(400);
    expect((await call('POST', url, expert.token, { reason: 'ab' })).status).toBe(400);
    expect((await call('POST', url, inst.token, { reason: 'Yanlış kaynak' })).status).toBe(403);
    expect((await call('POST', url, farmer.token, { reason: 'Yanlış kaynak' })).status).toBe(403);
    // Taslak olmayan paketin onayı geri çekilemez.
    const rv = await call('POST', `/panel/packs/${packId}/revoke`, expert.token, {
      reason: 'Deneme',
    });
    expect(rv.status).toBe(404);
    expect((await call('POST', url, expert.token, { reason: 'Kaynak uyuşmuyor' })).status).toBe(
      200,
    );
    expect(await packStatus(packId)).toBe('reddedildi');
    expect((await call('POST', `/panel/packs/${packId}/approve`, expert.token)).status).toBe(404);
    const a = await sql<{ detail: { reason: string } }>(
      "SELECT detail FROM audit_log WHERE action = 'panel.crop_pack.reject' AND entity_id = $1",
      [packId],
    );
    expect(a[0]!.detail.reason).toBe('Kaynak uyuşmuyor');
  });

  it('onaylı paketin onayı geri çekilir, taslağa döner; yeniden onaylanabilir', async () => {
    const [np] = await sql<{ id: string }>(
      `INSERT INTO crop_pack_versions(crop_id, version, kc_ini, kc_mid, kc_end, source, source_version, retrieved_at)
       SELECT crop_id, 99, kc_ini, kc_mid, kc_end, source, source_version, retrieved_at
       FROM crop_pack_versions WHERE id = $1 RETURNING id`,
      [packId],
    );
    const id = np!.id;
    expect((await call('POST', `/panel/packs/${id}/approve`, expert.token)).status).toBe(200);
    const url = `/panel/packs/${id}/revoke`;
    expect((await call('POST', url, inst.token, { reason: 'Yeni yayın' })).status).toBe(403);
    expect((await call('POST', url, expert.token, {})).status).toBe(400);
    expect((await call('POST', url, admin.token, { reason: 'Yeni yayın çıktı' })).status).toBe(200);
    expect(await packStatus(id)).toBe('taslak-uzman-onayi-bekliyor');
    expect((await call('POST', `/panel/packs/${id}/approve`, expert.token)).status).toBe(200);
  });

  it('evre reddetme ve geri çekme', async () => {
    const add = await call('POST', `/panel/packs/${packId}/stages`, expert.token, {
      nameTr: 'Çiçeklenme',
      frostCriticalC: -2,
      source: 'Test kaynağı',
    });
    const seq = add.body.seq as number;
    const url = `/panel/packs/${packId}/stages/${seq}`;
    const why = { reason: 'Değer şüpheli' };
    expect((await call('POST', `${url}/revoke`, expert.token, why)).status).toBe(404);
    expect((await call('POST', `${url}/approve`, admin.token)).status).toBe(200);
    expect((await call('POST', `${url}/reject`, expert.token, why)).status).toBe(404);
    expect((await call('POST', `${url}/revoke`, inst.token, why)).status).toBe(403);
    expect((await call('POST', `${url}/revoke`, expert.token, why)).status).toBe(200);
    expect(await stageStatus(seq)).toBe('taslak-uzman-onayi-bekliyor');
    expect((await call('POST', `${url}/reject`, expert.token, why)).status).toBe(200);
    expect(await stageStatus(seq)).toBe('reddedildi');
  });

  it('geçiş parametreyle seçilemez: genel işlev uygulama rolüne kapalı', async () => {
    await expect(
      systemTx(db, async (q) => {
        await q.query("SELECT set_config('app.user_id', $1, true)", [expert.userId]);
        await q.exec('SET LOCAL ROLE tp_app');
        await q.query(
          "SELECT withdraw_crop_pack($1, 'taslak-uzman-onayi-bekliyor', 'uzman-onayli', 'x', 'abc')",
          [packId],
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('duyuru düzenleme, silme, reddetme, geri çekme', () => {
  const ann = {
    sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
    title: 'İlk başlık',
    body: 'Metin.',
    publishedAt: '2026-01-01T00:00:00Z',
    targeting: { places: [{ province: 'Gaziantep' }], circle: null, cropIds: [] },
  };
  let fieldId: string;
  const visible = async () =>
    (await call('GET', `/fields/${fieldId}/announcements`, farmer.token)).body.announcements as {
      id: string;
      title: string;
      needsBadge: boolean;
    }[];

  beforeAll(async () => {
    const f = await call('POST', '/fields', farmer.token, {
      name: 'Gaziantep tarlası',
      province: 'Gaziantep',
      district: 'Şahinbey',
      lat: 37.06,
      lon: 37.38,
    });
    expect(f.status).toBe(201);
    fieldId = f.body.id;
  });

  it('düzenleme sürümü artırır, onayı düşürür; yabancı kurum düzenleyemez/silemez', async () => {
    const c = await call('POST', '/announcements', inst.token, ann);
    const id = c.body.id as string;
    expect((await call('POST', `/announcements/${id}/approve`, expert.token)).status).toBe(200);
    expect((await visible()).find((a) => a.id === id)?.needsBadge).toBe(false);

    const edit = { ...ann, title: 'Düzeltilmiş başlık' };
    expect((await call('PUT', `/announcements/${id}`, inst2.token, edit)).status).toBe(403);
    expect((await call('PUT', `/announcements/${id}`, farmer.token, edit)).status).toBe(403);
    expect(
      (await call('PUT', `/announcements/${id}`, inst.token, { ...edit, title: '' })).status,
    ).toBe(400);
    const r = await call('PUT', `/announcements/${id}`, inst.token, edit);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 2, reviewStatus: 'taslak-uzman-onayi-bekliyor' });
    expect((await visible()).find((a) => a.id === id)).toMatchObject({
      title: 'Düzeltilmiş başlık',
      needsBadge: true,
    });

    expect((await call('DELETE', `/announcements/${id}`, inst2.token)).status).toBe(403);
    expect((await call('DELETE', `/announcements/${id}`, inst.token)).status).toBe(200);
    expect((await visible()).some((a) => a.id === id)).toBe(false);
    // Silinmiş kayıt: 403 (varlık sızdırılmaz).
    expect((await call('DELETE', `/announcements/${id}`, inst.token)).status).toBe(403);
    const audit = await sql<{ action: string }>(
      "SELECT action FROM audit_log WHERE entity_id = $1 AND entity = 'announcements'",
      [id],
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['announcements.edit', 'announcements.delete']),
    );
  });

  it('uzman, başkasının duyurusunu da silebilir', async () => {
    const c = await call('POST', '/announcements', inst.token, ann);
    expect((await call('DELETE', `/announcements/${c.body.id}`, expert.token)).status).toBe(200);
  });

  it('reddedilen duyuru çiftçiye hiç gösterilmez ve onaylanamaz; geri çekilen rozetli döner', async () => {
    const c = await call('POST', '/announcements', inst.token, { ...ann, title: 'Reddedilecek' });
    const id = c.body.id as string;
    const url = `/announcements/${id}/reject`;
    expect((await call('POST', url, inst.token, { reason: 'Hatalı' })).status).toBe(403);
    expect((await call('POST', url, expert.token, {})).status).toBe(400);
    expect((await call('POST', url, expert.token, { reason: 'Yanlış bilgi' })).status).toBe(200);
    expect((await visible()).some((a) => a.id === id)).toBe(false);
    expect((await call('POST', `/announcements/${id}/approve`, expert.token)).status).toBe(403);

    const c2 = await call('POST', '/announcements', inst.token, {
      ...ann,
      title: 'Geri çekilecek',
    });
    const id2 = c2.body.id as string;
    await call('POST', `/announcements/${id2}/approve`, expert.token);
    expect((await visible()).find((a) => a.id === id2)?.needsBadge).toBe(false);
    const rv = await call('POST', `/announcements/${id2}/revoke`, expert.token, {
      reason: 'Süre doldu',
    });
    expect(rv.status).toBe(200);
    expect((await visible()).find((a) => a.id === id2)?.needsBadge).toBe(true);
  });
});

describe('süresi geçen OTP ve oturum temizliği', () => {
  it('eskiler silinir, taze olanlar ve geçerli oturumlar kalır; yalnız yönetici elle çalıştırır', async () => {
    const day = 86_400_000;
    const at = (d: number) => new Date(Date.now() + d * day).toISOString();
    await sql(
      `INSERT INTO otp_codes(phone, code_hash, expires_at, created_at) VALUES
       ('+905329990001','h',$1,$1), ('+905329990002','h',$2,$2)`,
      [at(-3), at(1)],
    );
    await sql(
      `INSERT INTO sessions(user_id, token_hash, expires_at, revoked_at, created_at) VALUES
       ($1,'eski-sure',$2,NULL,$2), ($1,'eski-iptal',$3,$4,$2), ($1,'taze',$3,NULL,$2), ($1,'yeni-iptal',$3,$5,$2)`,
      [farmer.userId, at(-10), at(30), at(-9), at(-1)],
    );
    expect((await call('POST', '/admin/jobs/cleanup', farmer.token)).status).toBe(403);
    expect((await call('POST', '/admin/jobs/cleanup', expert.token)).status).toBe(403);
    const r = await call('POST', '/admin/jobs/cleanup', admin.token);
    expect(r.status).toBe(200);
    expect(r.body.otpDeleted).toBeGreaterThanOrEqual(1);
    expect(r.body.sessionsDeleted).toBe(2);
    const otp = await sql<{ phone: string }>(
      "SELECT phone FROM otp_codes WHERE phone LIKE '+90532999%'",
    );
    expect(otp.map((o) => o.phone)).toEqual(['+905329990002']);
    const ses = await sql<{ token_hash: string }>(
      "SELECT token_hash FROM sessions WHERE token_hash IN ('eski-sure','eski-iptal','taze','yeni-iptal') ORDER BY token_hash",
    );
    expect(ses.map((s) => s.token_hash)).toEqual(['taze', 'yeni-iptal']);
    // Canlı oturumlar bozulmadı.
    expect((await call('GET', '/panel/me', admin.token)).status).toBe(200);
    const [ok] = await sql<{ bad: string | null }>('SELECT verify_audit_chain()::text AS bad');
    expect(ok!.bad).toBeNull();
  });
});
