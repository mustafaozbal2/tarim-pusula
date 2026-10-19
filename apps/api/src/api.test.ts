import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { migrate, PgliteDb, systemTx } from './db/db';

const db = new PgliteDb();
const sms = new FakeSmsProvider();
let app: INestApplication;
let base: string;
let clock = new Date('2026-10-20T10:00:00Z');

const ADMIN_PHONE = '+905329999999';
const ALI = '+905321111111';
const VELI = '+905322222222';

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
  expect((await call('POST', '/auth/otp/request', undefined, { phone })).status).toBe(200);
  const r = await call('POST', '/auth/otp/verify', undefined, { phone, code: sms.lastCode(phone) });
  expect(r.status).toBe(200);
  return r.body as { token: string; userId: string; isNewUser: boolean };
}

const auditCount = () =>
  systemTx(db, async (q) =>
    Number((await q.query<{ n: string }>('SELECT count(*)::text n FROM audit_log'))[0]!.n),
  );

let ali: Awaited<ReturnType<typeof login>>;
let veli: Awaited<ReturnType<typeof login>>;
let admin: Awaited<ReturnType<typeof login>>;
let aliFieldId: string;

beforeAll(async () => {
  await migrate(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { now: () => clock, adminPhones: [ADMIN_PHONE], otpSecret: 'test' },
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login(ALI);
  veli = await login(VELI);
  admin = await login(ADMIN_PHONE);
  const f = await call('POST', '/fields', ali.token, {
    name: 'Fıstık bahçesi',
    lat: 37.06,
    lon: 37.38,
  });
  aliFieldId = f.body.id;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('giriş (SMS-OTP)', () => {
  it('yeni kullanıcı farmer rolüyle oluşur; telefon dışında kimlik verisi tutulmaz', async () => {
    expect(ali.isNewUser).toBe(true);
    const me = await call('GET', '/me', ali.token);
    expect(me.body.roles).toEqual(['farmer']);
    expect(Object.keys(me.body).sort()).toEqual([
      'createdAt',
      'displayName',
      'id',
      'phone',
      'roles',
    ]);
  });
  it('geçersiz telefon (ör. 11 haneli TC kimlik no) reddedilir', async () => {
    const r = await call('POST', '/auth/otp/request', undefined, { phone: '12345678901' });
    expect(r.status).toBe(400);
  });
  it('yanlış kod 401; 5 yanlış denemeden sonra doğru kod da geçmez', async () => {
    const phone = '+905323333333';
    await call('POST', '/auth/otp/request', undefined, { phone });
    const good = sms.lastCode(phone);
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await call('POST', '/auth/otp/verify', undefined, { phone, code: bad })).status).toBe(
        401,
      );
    }
    expect((await call('POST', '/auth/otp/verify', undefined, { phone, code: good })).status).toBe(
      401,
    );
  });
  it('kod bir kez kullanılır ve süresi dolar', async () => {
    const phone = '+905324444444';
    await call('POST', '/auth/otp/request', undefined, { phone });
    const code = sms.lastCode(phone);
    expect((await call('POST', '/auth/otp/verify', undefined, { phone, code })).status).toBe(200);
    expect((await call('POST', '/auth/otp/verify', undefined, { phone, code })).status).toBe(401);

    await call('POST', '/auth/otp/request', undefined, { phone });
    const code2 = sms.lastCode(phone);
    clock = new Date(clock.getTime() + 6 * 60 * 1000);
    expect((await call('POST', '/auth/otp/verify', undefined, { phone, code: code2 })).status).toBe(
      401,
    );
    clock = new Date(clock.getTime() - 6 * 60 * 1000);
  });
  it('kod isteği sınırlıdır (429)', async () => {
    const phone = '+905325555555';
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await call('POST', '/auth/otp/request', undefined, { phone })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
  it('kod veritabanında düz metin saklanmaz', async () => {
    const rows = await systemTx(db, (q) =>
      q.query<{ code_hash: string }>('SELECT code_hash FROM otp_codes'),
    );
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash))).toBe(true);
  });
  it('jetonsuz / sahte jetonlu istek 401; çıkış jetonu geçersiz kılar', async () => {
    expect((await call('GET', '/fields')).status).toBe(401);
    expect((await call('GET', '/fields', 'sahte')).status).toBe(401);
    const tmp = await login('+905326666666');
    expect((await call('GET', '/me', tmp.token)).status).toBe(200);
    expect((await call('POST', '/auth/logout', tmp.token)).status).toBe(204);
    expect((await call('GET', '/me', tmp.token)).status).toBe(401);
  });
  it('/health herkese açık', async () => {
    expect((await call('GET', '/health')).status).toBe(200);
  });
});

describe('yetki: başkasının verisi 403', () => {
  it('sahibi tarlasını okur, listeler', async () => {
    expect((await call('GET', `/fields/${aliFieldId}`, ali.token)).status).toBe(200);
    expect((await call('GET', '/fields', ali.token)).body).toHaveLength(1);
  });
  it('başkasının tarlasını okuma 403', async () => {
    expect((await call('GET', `/fields/${aliFieldId}`, veli.token)).status).toBe(403);
  });
  it('başkasının tarlasını yazma (PATCH) 403 ve veri değişmez', async () => {
    expect(
      (await call('PATCH', `/fields/${aliFieldId}`, veli.token, { name: 'çaldım' })).status,
    ).toBe(403);
    expect((await call('GET', `/fields/${aliFieldId}`, ali.token)).body.name).toBe(
      'Fıstık bahçesi',
    );
  });
  it('başkasının tarlasını silme 403', async () => {
    expect((await call('DELETE', `/fields/${aliFieldId}`, veli.token)).status).toBe(403);
    expect((await call('GET', `/fields/${aliFieldId}`, ali.token)).status).toBe(200);
  });
  it('listede başkasının tarlası görünmez; admin de göremez', async () => {
    expect((await call('GET', '/fields', veli.token)).body).toEqual([]);
    expect((await call('GET', '/fields', admin.token)).body).toEqual([]);
    expect((await call('GET', `/fields/${aliFieldId}`, admin.token)).status).toBe(403);
  });
  it('olmayan ya da bozuk kimlik de 403 (varlık sızdırılmaz)', async () => {
    expect(
      (await call('GET', '/fields/00000000-0000-4000-8000-000000000000', ali.token)).status,
    ).toBe(403);
    expect((await call('GET', '/fields/abc', ali.token)).status).toBe(403);
  });
  it('başkasının tarlasına cihaz ekleme 403', async () => {
    const r = await call('POST', '/devices', veli.token, { fieldId: aliFieldId, name: 'vana' });
    expect(r.status).toBe(403);
  });
  it('başkasının tarlasına erişim verme 403', async () => {
    const r = await call('POST', `/fields/${aliFieldId}/access`, veli.token, {
      userId: veli.userId,
      level: 'write',
    });
    expect(r.status).toBe(403);
  });
  it('reddedilen denemeler denetim kaydına düşer', async () => {
    const rows = await systemTx(db, (q) =>
      q.query('SELECT 1 FROM audit_log WHERE action = $1 AND actor_id = $2', [
        'access.denied',
        veli.userId,
      ]),
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
  it('rol kısıtı: farmer admin ucuna giremez (403)', async () => {
    expect((await call('GET', '/admin/audit', ali.token)).status).toBe(403);
    expect(
      (await call('POST', `/admin/users/${ali.userId}/roles`, ali.token, { role: 'admin' })).status,
    ).toBe(403);
  });
});

describe('yetki: paylaşım', () => {
  it('okuma yetkili görür ama yazamaz; yazma yetkili yazar; iptal edilince 403', async () => {
    const g = await call('POST', `/fields/${aliFieldId}/access`, ali.token, {
      userId: veli.userId,
      level: 'read',
    });
    expect(g.status).toBe(201);
    expect((await call('GET', `/fields/${aliFieldId}`, veli.token)).status).toBe(200);
    expect((await call('PATCH', `/fields/${aliFieldId}`, veli.token, { name: 'x' })).status).toBe(
      403,
    );
    await call('POST', `/fields/${aliFieldId}/access`, ali.token, {
      userId: veli.userId,
      level: 'write',
    });
    expect(
      (await call('PATCH', `/fields/${aliFieldId}`, veli.token, { cropId: 'fistik' })).status,
    ).toBe(200);
    expect((await call('DELETE', `/fields/${aliFieldId}`, veli.token)).status).toBe(403);
    expect(
      (await call('DELETE', `/fields/${aliFieldId}/access/${veli.userId}`, ali.token)).status,
    ).toBe(204);
    expect((await call('GET', `/fields/${aliFieldId}`, veli.token)).status).toBe(403);
  });
});

describe('audit_log: her mutasyon satır üretir', () => {
  it.each([
    ['tarla ekle', async () => call('POST', '/fields', veli.token, { name: 'Veli tarlası' })],
    ['profil güncelle', async () => call('PATCH', '/me', veli.token, { displayName: 'Veli' })],
    [
      'rıza ekle',
      async () =>
        call('POST', '/me/consents', veli.token, {
          purpose: 'konum-isleme',
          granted: true,
          policyVersion: '2026-10',
        }),
    ],
  ])('%s', async (_ad, act) => {
    const before = await auditCount();
    const r = await act();
    expect(r.status).toBeLessThan(300);
    expect(await auditCount()).toBeGreaterThan(before);
  });

  it('tarla güncelle / cihaz ekle / cihaz sil / tarla sil: her biri satır ekler', async () => {
    const f = (await call('POST', '/fields', veli.token, { name: 'Geçici' })).body;
    let before = await auditCount();
    expect((await call('PATCH', `/fields/${f.id}`, veli.token, { name: 'Geçici 2' })).status).toBe(
      200,
    );
    expect(await auditCount()).toBe(before + 1);

    before = await auditCount();
    const d = await call('POST', '/devices', veli.token, { fieldId: f.id, name: 'Vana 1' });
    expect(d.status).toBe(201);
    expect(await auditCount()).toBe(before + 1);

    before = await auditCount();
    expect((await call('DELETE', `/devices/${d.body.id}`, veli.token)).status).toBe(204);
    expect(await auditCount()).toBe(before + 1);

    before = await auditCount();
    expect((await call('DELETE', `/fields/${f.id}`, veli.token)).status).toBe(204);
    expect(await auditCount()).toBe(before + 1);
  });

  it('giriş de denetlenir; yönetici zinciri doğrulayabilir', async () => {
    const logins = await systemTx(db, (q) =>
      q.query("SELECT 1 FROM audit_log WHERE action = 'auth.login'"),
    );
    expect(logins.length).toBeGreaterThanOrEqual(3);
    const v = await call('GET', '/admin/audit/verify', admin.token);
    expect(v.body).toEqual({ ok: true, firstBrokenSeq: null });
    const list = await call('GET', '/admin/audit?limit=5', admin.token);
    expect(list.body).toHaveLength(5);
  });

  it('admin rol verir; kayıt denetime düşer; olmayan kullanıcı 404', async () => {
    const before = await auditCount();
    const r = await call('POST', `/admin/users/${veli.userId}/roles`, admin.token, {
      role: 'advisor',
    });
    expect(r.status).toBe(201);
    expect(await auditCount()).toBe(before + 1);
    expect((await call('GET', '/me', veli.token)).body.roles).toContain('advisor');
    expect(
      (
        await call('POST', '/admin/users/00000000-0000-4000-8000-000000000000/roles', admin.token, {
          role: 'expert',
        })
      ).status,
    ).toBe(404);
  });
});

describe('doğrulama', () => {
  it('bozuk gövde 400', async () => {
    expect((await call('POST', '/fields', ali.token, { name: '' })).status).toBe(400);
    expect((await call('POST', '/fields', ali.token, { name: 'a', lat: 123 })).status).toBe(400);
    expect(
      (
        await call('POST', '/me/consents', ali.token, {
          purpose: 'x',
          granted: true,
          policyVersion: '1',
        })
      ).status,
    ).toBe(400);
  });
});

describe('KVKK', () => {
  it('rıza geçmişi eklenir, geri çekme yeni kayıttır', async () => {
    const u = await login('+905327777777');
    const c = { purpose: 'bildirim', policyVersion: '2026-10' };
    await call('POST', '/me/consents', u.token, { ...c, granted: true });
    await call('POST', '/me/consents', u.token, { ...c, granted: false });
    const list = await call('GET', '/me/consents', u.token);
    expect(list.body.map((x: { granted: boolean }) => x.granted)).toEqual([true, false]);
  });

  it('veri dışa aktarma: yalnız kendi verisi', async () => {
    const r = await call('GET', '/me/export', ali.token);
    expect(r.status).toBe(200);
    expect(r.body.profile.phone).toBe(ALI);
    expect(r.body.fields.map((f: { id: string }) => f.id)).toEqual([aliFieldId]);
    expect(JSON.stringify(r.body)).not.toContain(VELI);
    expect(r.body.auditLog.length).toBeGreaterThan(0);
  });

  it('hesap silme onay ister; sonra veri, oturum ve tarlalar gider; denetim satırları kalır', async () => {
    const u = await login('+905328888888');
    const f = (await call('POST', '/fields', u.token, { name: 'Silinecek' })).body;
    expect((await call('DELETE', '/me', u.token, {})).status).toBe(400);
    expect((await call('DELETE', '/me', u.token, { confirm: 'SIL' })).status).toBe(204);
    expect((await call('GET', '/me', u.token)).status).toBe(401);
    const left = await systemTx(db, async (q) => ({
      users: await q.query('SELECT 1 FROM users WHERE id = $1', [u.userId]),
      fields: await q.query('SELECT 1 FROM fields WHERE id = $1', [f.id]),
      sessions: await q.query('SELECT 1 FROM sessions WHERE user_id = $1', [u.userId]),
      audit: await q.query(
        "SELECT 1 FROM audit_log WHERE action = 'account.delete' AND actor_id = $1",
        [u.userId],
      ),
    }));
    expect(left.users).toHaveLength(0);
    expect(left.fields).toHaveLength(0);
    expect(left.sessions).toHaveLength(0);
    expect(left.audit).toHaveLength(1);
    // Silinen kullanıcı aynı numarayla yeniden kayıt olabilir (yeni kimlik).
    expect((await login('+905328888888')).userId).not.toBe(u.userId);
  });
});
