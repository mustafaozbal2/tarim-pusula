import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { base32Decode, hotp, totpStep } from './auth/totp';
import { maskPhone } from './controllers.g17';
import { importCropCatalog } from './crops';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { Places } from './places';

/** G17: panel özet/liste uçları ve duyuru görseli. */
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
const codeFor = (secret: string) => hotp(base32Decode(secret), totpStep(new Date()));

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
let inst2: Awaited<ReturnType<typeof panelLogin>>;
let expert: Awaited<ReturnType<typeof panelLogin>>;
let admin: Awaited<ReturnType<typeof panelLogin>>;
let farmer: Awaited<ReturnType<typeof login>>;

// 1x1 PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ann = (extra: Record<string, unknown> = {}) => ({
  sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
  title: 'Fıstıkta gübreleme zamanı',
  body: 'Bu yıl gübreleme için uygun dönem başladı.',
  publishedAt: '2026-10-20T00:00:00.000Z',
  targeting: { places: [{ province: 'Gaziantep' }], circle: null, cropIds: [] },
  ...extra,
});

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({ db, sms, auth: { otpSecret: 'test' }, places: Places.load() }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  farmer = await login('+905321170001');
  inst = await panelLogin('+905321170002', 'institution_admin');
  inst2 = await panelLogin('+905321170003', 'institution_admin');
  expert = await panelLogin('+905321170004', 'expert');
  admin = await panelLogin('+905321170005', 'admin');
  const f = await call('POST', '/fields', farmer.token, {
    name: 'Mustafa Amcanın Bahçesi',
    province: 'Gaziantep',
    district: 'Nizip',
    lat: 37.01,
    lon: 37.79,
    cropId: 'antep-fistigi',
    areaDecare: 12,
  });
  expect(f.status).toBe(201);
  const d = await call('POST', '/devices', farmer.token, { fieldId: f.body.id, name: 'Vana 1' });
  expect(d.status).toBe(201);
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('maskPhone', () => {
  it('tam numara gösterilmez', () => {
    expect(maskPhone('+905321234567')).toBe('+90532 *** ** 67');
    expect(maskPhone('bozuk')).toBe('***');
  });
});

describe('panel özeti', () => {
  it('çiftçi 403, girişsiz 401', async () => {
    expect((await call('GET', '/panel/summary', farmer.token)).status).toBe(403);
    expect((await call('GET', '/panel/summary')).status).toBe(401);
  });

  it('kurum yöneticisi yalnız kendi duyurularını sayar; tarla/cihaz toplamları anonimdir', async () => {
    expect((await call('POST', '/announcements', inst.token, ann())).status).toBe(201);
    expect(
      (await call('POST', '/announcements', inst2.token, ann({ title: 'Başka kurum' }))).status,
    ).toBe(201);
    const s = (await call('GET', '/panel/summary', inst.token)).body;
    expect(s.announcements).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.fields).toBeGreaterThanOrEqual(1);
    expect(s.devices).toBeGreaterThanOrEqual(1);
    // son işlemler yalnız tür + zaman + varlık: kişi kimliği yok
    for (const r of s.recent) expect(Object.keys(r).sort()).toEqual(['action', 'at', 'entity']);
    expect(JSON.stringify(s)).not.toContain('Mustafa');
  });

  it('uzman bekleyen onayları (duyuru + paket + evre) görür', async () => {
    const s = (await call('GET', '/panel/summary', expert.token)).body;
    expect(s.announcements).toBeGreaterThanOrEqual(2);
    expect(s.pending).toBeGreaterThanOrEqual(2 + 33); // 2 taslak duyuru + 33 taslak paket
  });
});

describe('arazi, cihaz ve kullanıcı listeleri', () => {
  it('arazi listesi uzman/yöneticiye açık, kurum yöneticisine kapalı; ad ve sahip dönmez', async () => {
    expect((await call('GET', '/panel/fields', inst.token)).status).toBe(403);
    const r = await call('GET', '/panel/fields', expert.token);
    expect(r.status).toBe(200);
    const row = r.body.find((x: { cropId: string }) => x.cropId === 'antep-fistigi');
    expect(row).toMatchObject({
      province: 'Gaziantep',
      district: 'Nizip',
      areaDecare: 12,
      deviceCount: 1,
    });
    expect(JSON.stringify(r.body)).not.toContain('Mustafa');
    expect(Object.keys(row)).not.toContain('name');
    expect(Object.keys(row)).not.toContain('ownerId');
  });

  it('listeleme denetim kaydına düşer', async () => {
    const rows = await sql<{ n: string }>(
      "SELECT count(*)::text AS n FROM audit_log WHERE action = 'panel.fields.list'",
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it('cihazlar yalnız yöneticiye açık', async () => {
    expect((await call('GET', '/panel/devices', expert.token)).status).toBe(403);
    const r = await call('GET', '/panel/devices', admin.token);
    expect(r.status).toBe(200);
    expect(r.body[0]).toMatchObject({ name: 'Vana 1', province: 'Gaziantep' });
  });

  it('kullanıcılar: yalnız personel, telefon maskeli, MFA durumu doğru', async () => {
    expect((await call('GET', '/panel/users', inst.token)).status).toBe(403);
    const r = await call('GET', '/panel/users', admin.token);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(4); // çiftçi listede yok
    const txt = JSON.stringify(r.body);
    expect(txt).not.toContain('+905321170002');
    expect(txt).toContain('+90532 *** ** 02');
    expect(r.body.every((u: { mfaEnrolled: boolean }) => u.mfaEnrolled)).toBe(true);
    const roles = r.body.flatMap((u: { roles: string[] }) => u.roles).sort();
    expect(roles).toEqual(['admin', 'expert', 'institution_admin', 'institution_admin']);
  });

  it('MFA sıfırlama sonrası kullanıcı "kurulmamış" görünür', async () => {
    expect((await call('POST', `/panel/mfa/reset/${inst2.userId}`, admin.token)).status).toBe(200);
    const after = (await call('GET', '/panel/users', admin.token)).body as {
      id: string;
      mfaEnrolled: boolean;
    }[];
    expect(after.find((u) => u.id === inst2.userId)!.mfaEnrolled).toBe(false);
  });
});

describe('duyuru görseli', () => {
  let id: string;
  it('görselli duyuru oluşur; liste görseli taşımaz, tekil uç taşır', async () => {
    const c = await call(
      'POST',
      '/announcements',
      inst.token,
      ann({ title: 'Görselli', imageDataUrl: PNG }),
    );
    expect(c.status).toBe(201);
    id = c.body.id;
    const list = (await call('GET', '/announcements/managed', inst.token)).body;
    const row = list.find((a: { id: string }) => a.id === id);
    expect(row.hasImage).toBe(true);
    expect(row.imageDataUrl).toBeUndefined();
    const one = await call('GET', `/announcements/managed/${id}`, inst.token);
    expect(one.status).toBe(200);
    expect(one.body.imageDataUrl).toBe(PNG);
  });

  it('başka kurumun duyurusunu tekil uçtan açamaz', async () => {
    expect((await call('GET', `/announcements/managed/${id}`, admin.token)).status).toBe(200);
    // inst2'nin MFA'sı sıfırlandı; yeniden kurmadan zaten 403. Üçüncü bir kurum yöneticisiyle denenir.
    const other = await panelLogin('+905321170006', 'institution_admin');
    expect((await call('GET', `/announcements/managed/${id}`, other.token)).status).toBe(403);
  });

  it('geçersiz görsel türü ve aşırı büyük görsel 400', async () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    expect(
      (await call('POST', '/announcements', inst.token, ann({ imageDataUrl: svg }))).status,
    ).toBe(400);
    const big = `data:image/png;base64,${'A'.repeat(300_001)}`;
    // Sınır aşımı ya gövde sınırında (413) ya da şemada (400) reddedilir; hiçbir durumda kaydedilmez.
    expect([400, 413]).toContain(
      (await call('POST', '/announcements', inst.token, ann({ imageDataUrl: big }))).status,
    );
  });

  it('düzenleme görseli kaldırır ve taslağa döner', async () => {
    const e = await call(
      'PUT',
      `/announcements/${id}`,
      inst.token,
      ann({ title: 'Görselli v2', imageDataUrl: null }),
    );
    expect(e.status).toBe(200);
    expect(e.body.reviewStatus).toBe('taslak-uzman-onayi-bekliyor');
    const one = (await call('GET', `/announcements/managed/${id}`, inst.token)).body;
    expect(one.imageDataUrl).toBeNull();
    expect(one.title).toBe('Görselli v2');
  });
});
