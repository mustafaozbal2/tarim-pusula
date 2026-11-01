import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FakePushClient } from '@tarim/workers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';

/**
 * G24 uçtan uca (sunucu): şifreli giriş, yetkili başvurusu ve onayı, kademe denetimi, duyurunun yalnız
 * doğru çiftçiye düşmesi, uzmana sor yönlendirmesi ve cevap bildirimi.
 */
const db = createTestDb();
const sms = new FakeSmsProvider();
const push = new FakePushClient();
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
const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  systemTx(db, (q) => q.query<T>(text, params));
const code = async (phone: string) => {
  await call('POST', '/auth/otp/request', undefined, { phone });
  return sms.lastCode(phone);
};
const PW = 'Tarla2026';

/** Çiftçi kaydı (şifreli) + arazi. */
async function farmer(phone: string, field: Record<string, unknown>) {
  const r = await call('POST', '/auth/register', undefined, {
    phone,
    code: await code(phone),
    password: PW,
    name: 'Çiftçi',
    kvkk: true,
  });
  expect(r.status).toBe(200);
  const f = await call('POST', '/fields', r.body.token, { lat: 37.06, lon: 37.38, ...field });
  expect(f.status).toBe(201);
  return {
    token: r.body.token as string,
    userId: r.body.userId as string,
    fieldId: f.body.id as string,
  };
}

/** Yetkili başvurusu + yönetici onayı + şifreyle giriş + SMS ikinci adım. */
async function staff(phone: string, profile: Record<string, unknown>, adminToken: string) {
  const reg = await call('POST', '/auth/staff/register', undefined, {
    phone,
    code: await code(phone),
    password: PW,
    name: 'Uzman',
    title: 'Ziraat mühendisi',
    registryNo: 'TB-1234',
    kvkk: true,
    ...profile,
  });
  expect(reg.status).toBe(200);
  // Yönetici başvuruyu listede görür (onay ekranı).
  const list = await call('GET', '/panel/staff', adminToken);
  expect(list.body.some((a: { userId: string }) => a.userId === reg.body.userId)).toBe(true);
  const d = await call('POST', `/panel/staff/${reg.body.userId}/decision`, adminToken, {
    approve: true,
  });
  expect(d.status).toBe(200);
  const l = await call('POST', '/auth/login', undefined, { phone, password: PW });
  expect(l.body.mfaRequired).toBe(true);
  await call('POST', '/auth/mfa/sms/request', l.body.token);
  const v = await call('POST', '/auth/mfa/sms/verify', l.body.token, { code: sms.lastCode(phone) });
  expect(v.status).toBe(200);
  return { token: l.body.token as string, userId: reg.body.userId as string };
}

let admin: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({ db, sms, push, auth: { otpSecret: 'test' } }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  // Yönetici: kayıt + admin rolü + şifreli giriş + SMS ikinci adım.
  const a = await call('POST', '/auth/register', undefined, {
    phone: '+905550000000',
    code: await code('+905550000000'),
    password: PW,
    kvkk: true,
  });
  await sql(`INSERT INTO user_roles(user_id, role) VALUES ($1, 'admin')`, [a.body.userId]);
  const l = await call('POST', '/auth/login', undefined, { phone: '+905550000000', password: PW });
  await call('POST', '/auth/mfa/sms/request', l.body.token);
  await call('POST', '/auth/mfa/sms/verify', l.body.token, { code: sms.lastCode('+905550000000') });
  admin = l.body.token;
}, 120_000);

afterAll(async () => {
  await app.close();
});

describe('G24 şifreli giriş ve kayıt', () => {
  it('kayıt -> şifreyle giriş; yanlış şifre ve kayıtsız numara aynı hata; 5 yanlışta kilit', async () => {
    const phone = '+905550000001';
    await farmer(phone, { name: 'A' });
    const ok = await call('POST', '/auth/login', undefined, { phone, password: PW });
    expect(ok.status).toBe(200);
    expect(ok.body.mfaRequired).toBe(false);
    const bad = await call('POST', '/auth/login', undefined, { phone, password: 'Yanlis123' });
    const none = await call('POST', '/auth/login', undefined, {
      phone: '+905559999999',
      password: 'Yanlis123',
    });
    expect(bad.status).toBe(401);
    expect(none.status).toBe(401);
    expect(bad.body.message).toBe(none.body.message);
    for (let i = 0; i < 5; i++) {
      await call('POST', '/auth/login', undefined, { phone, password: 'Yanlis123' });
    }
    const locked = await call('POST', '/auth/login', undefined, { phone, password: PW });
    expect(locked.status).toBe(429);
  });

  it('aynı numarayla ikinci kayıt 409; şifre sıfırlama eski oturumları kapatır', async () => {
    const phone = '+905550000002';
    const f = await farmer(phone, { name: 'B' });
    const again = await call('POST', '/auth/register', undefined, {
      phone,
      code: await code(phone),
      password: PW,
      kvkk: true,
    });
    expect(again.status).toBe(409);
    const r = await call('POST', '/auth/password/reset', undefined, {
      phone,
      code: await code(phone),
      password: 'YeniSifre9',
    });
    expect(r.status).toBe(200);
    expect((await call('GET', '/fields', f.token)).status).toBe(401);
    expect((await call('GET', '/fields', r.body.token)).status).toBe(200);
    const l = await call('POST', '/auth/login', undefined, { phone, password: 'YeniSifre9' });
    expect(l.status).toBe(200);
  });

  it('zayıf şifre ve TC kimlik no benzeri sicil reddedilir', async () => {
    const weak = await call('POST', '/auth/register', undefined, {
      phone: '+905550000003',
      code: '123456',
      password: 'abcdefgh',
      kvkk: true,
    });
    expect(weak.status).toBe(400);
    const tc = await call('POST', '/auth/staff/register', undefined, {
      phone: '+905550000004',
      code: '123456',
      password: PW,
      name: 'X',
      institution: 'universite',
      institutionName: 'Üni',
      province: 'Gaziantep',
      title: 'Doç.',
      registryNo: '12345678901',
      kvkk: true,
    });
    expect(tc.status).toBe(400);
  });
});

describe('G24 yetki kademesi ve duyuru', () => {
  it('onaysız yetkili yayın yapamaz; SMS ikinci adımı olmadan yetkili uçları kapalı', async () => {
    const phone = '+905550000010';
    const reg = await call('POST', '/auth/staff/register', undefined, {
      phone,
      code: await code(phone),
      password: PW,
      name: 'Bekleyen',
      institution: 'il_mudurlugu',
      institutionName: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
      province: 'Gaziantep',
      title: 'Mühendis',
      registryNo: 'IL-27',
      kvkk: true,
    });
    expect(reg.status).toBe(200);
    const me = await call('GET', '/staff/me', reg.body.token);
    expect(me.body.profile.status).toBe('basvuru');
    // Rol yok: yayın 403.
    const pub = await call('POST', '/announcements', reg.body.token, {
      sourceOrg: 'X',
      title: 'T',
      body: 'B',
      publishedAt: new Date().toISOString(),
    });
    expect(pub.status).toBe(403);
    // Onaylanır ama şifreyle yeni girişte SMS adımı yapılmazsa yetkili uçları 403.
    await call('POST', `/panel/staff/${reg.body.userId}/decision`, admin, { approve: true });
    const l = await call('POST', '/auth/login', undefined, { phone, password: PW });
    expect((await call('GET', '/staff/announcements', l.body.token)).status).toBe(403);
    // Başvuru sonucu bildirimi kutuya düşer.
    const inbox = await call('GET', '/me/notifications', l.body.token);
    expect(inbox.body[0].kind).toBe('basvuru');
  });

  it('ilçe uzmanı yalnız kendi ilçesine yayınlar; duyurusu doğrudan yayında ve yalnız doğru çiftçiye düşer', async () => {
    const sahinbey = await staff(
      '+905550000020',
      {
        institution: 'ilce_mudurlugu',
        institutionName: 'Şahinbey İlçe Tarım ve Orman Müdürlüğü',
        province: 'Gaziantep',
        district: 'Şahinbey',
      },
      admin,
    );
    const me = await call('GET', '/staff/me', sahinbey.token);
    expect(me.body.scopeLabel).toBe('Gaziantep / Şahinbey');

    const base = {
      sourceOrg: 'Şahinbey İlçe Tarım',
      title: 'Fıstıkta budama günü',
      body: 'Cumartesi uygulamalı budama eğitimi var.',
      publishedAt: new Date(Date.now() - 60_000).toISOString(),
      category: 'bilgilendirme',
      imageDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    };
    // Kapsam dışı: il geneli, komşu ilçe, ulusal.
    for (const places of [
      [{ province: 'Gaziantep' }],
      [{ province: 'Gaziantep', district: 'Şehitkamil' }],
      [],
    ]) {
      const r = await call('POST', '/announcements', sahinbey.token, {
        ...base,
        targeting: { places, circle: null, cropIds: [] },
      });
      expect(r.status).toBe(403);
    }
    const ok = await call('POST', '/announcements', sahinbey.token, {
      ...base,
      targeting: {
        places: [{ province: 'Gaziantep', district: 'Şahinbey' }],
        circle: null,
        cropIds: ['antep-fistigi'],
      },
    });
    expect(ok.status).toBe(201);
    expect(ok.body.reviewStatus).toBe('uzman-onayli');

    const hit = await farmer('+905550000021', {
      name: 'Şahinbey fıstık',
      province: 'Gaziantep',
      district: 'Şahinbey',
      cropId: 'antep-fistigi',
    });
    const otherDistrict = await farmer('+905550000022', {
      name: 'Şehitkamil fıstık',
      province: 'Gaziantep',
      district: 'Şehitkamil',
      cropId: 'antep-fistigi',
    });
    const otherCrop = await farmer('+905550000023', {
      name: 'Şahinbey zeytin',
      province: 'Gaziantep',
      district: 'Şahinbey',
      cropId: 'zeytin',
    });
    const see = async (f: { token: string; fieldId: string }) =>
      (await call('GET', `/fields/${f.fieldId}/announcements`, f.token)).body.announcements as {
        title: string;
        imageDataUrl: string | null;
        category: string | null;
      }[];
    const a = (await see(hit)).find((x) => x.title === base.title);
    expect(a?.imageDataUrl).toBe(base.imageDataUrl);
    expect(a?.category).toBe('bilgilendirme');
    expect((await see(otherDistrict)).some((x) => x.title === base.title)).toBe(false);
    expect((await see(otherCrop)).some((x) => x.title === base.title)).toBe(false);
    // Yayınladıklarım listesinde.
    const mine = await call('GET', '/staff/announcements', sahinbey.token);
    expect(mine.body.map((x: { title: string }) => x.title)).toContain(base.title);
  });

  it('bakanlık uzmanı ulusal duyuru yapar; il uzmanı başka ile yapamaz', async () => {
    const bak = await staff(
      '+905550000030',
      { institution: 'bakanlik', institutionName: 'Tarım ve Orman Bakanlığı' },
      admin,
    );
    const il = await staff(
      '+905550000031',
      { institution: 'il_mudurlugu', institutionName: 'Gaziantep İl', province: 'Gaziantep' },
      admin,
    );
    const ann = (places: object[]) => ({
      sourceOrg: 'Kurum',
      title: 'Duyuru',
      body: 'Metin',
      publishedAt: new Date().toISOString(),
      targeting: { places, circle: null, cropIds: [] },
    });
    expect((await call('POST', '/announcements', bak.token, ann([]))).status).toBe(201);
    expect((await call('POST', '/announcements', il.token, ann([]))).status).toBe(403);
    expect(
      (await call('POST', '/announcements', il.token, ann([{ province: 'Şanlıurfa' }]))).status,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          '/announcements',
          il.token,
          ann([{ province: 'Gaziantep', district: 'Nizip' }]),
        )
      ).status,
    ).toBe(201);
  });
});

describe('G24 kurum yetkilisi taslağı ve uzman onayı', () => {
  it('belediye taslağı yalnız o ilçeyi kapsayan uzmana görünür ve onu onaylar; başka il uzmanı onaylayamaz', async () => {
    const bel = await staff(
      '+905550000060',
      {
        institution: 'belediye',
        institutionName: 'Nizip Belediyesi',
        province: 'Gaziantep',
        district: 'Nizip',
        wantsRole: 'institution_admin',
      },
      admin,
    );
    const gaz = await staff(
      '+905550000061',
      { institution: 'il_mudurlugu', institutionName: 'Gaziantep İl', province: 'Gaziantep' },
      admin,
    );
    const urfa = await staff(
      '+905550000062',
      { institution: 'il_mudurlugu', institutionName: 'Şanlıurfa İl', province: 'Şanlıurfa' },
      admin,
    );
    const r = await call('POST', '/announcements', bel.token, {
      sourceOrg: 'Nizip Belediyesi',
      title: 'Fide dağıtımı',
      body: 'Belediye bahçesinde ücretsiz fide dağıtılacak.',
      publishedAt: new Date().toISOString(),
      targeting: {
        places: [{ province: 'Gaziantep', district: 'Nizip' }],
        circle: null,
        cropIds: [],
      },
    });
    expect(r.status).toBe(201);
    expect(r.body.reviewStatus).toBe('taslak-uzman-onayi-bekliyor');
    const seen = await call('GET', '/staff/drafts', gaz.token);
    expect(seen.body.map((d: { id: string }) => d.id)).toContain(r.body.id);
    const notSeen = await call('GET', '/staff/drafts', urfa.token);
    expect(notSeen.body.map((d: { id: string }) => d.id)).not.toContain(r.body.id);
    // Kurum yetkilisi kendi taslağını onaylayamaz (uzman rolü yok).
    expect((await call('POST', `/announcements/${r.body.id}/approve`, bel.token)).status).toBe(403);
    expect((await call('POST', `/announcements/${r.body.id}/approve`, urfa.token)).status).toBe(
      403,
    );
    const ok = await call('POST', `/announcements/${r.body.id}/approve`, gaz.token);
    expect(ok.status).toBe(200);
    expect((await call('GET', '/staff/drafts', gaz.token)).body).toHaveLength(0);
  });
});

describe('G24 uzmana sor: yönlendirme ve bildirim', () => {
  it('Şahinbeyli çiftçinin sorusu Şahinbey uzmanına gider; cevap çiftçiye zil + telefon bildirimi olur', async () => {
    const uzman = await staff(
      '+905550000040',
      {
        institution: 'ilce_mudurlugu',
        institutionName: 'Şahinbey İlçe Tarım',
        province: 'Gaziantep',
        district: 'Şahinbey',
        expertise: ['antep-fistigi'],
      },
      admin,
    );
    const baska = await staff(
      '+905550000041',
      { institution: 'il_mudurlugu', institutionName: 'Şanlıurfa İl', province: 'Şanlıurfa' },
      admin,
    );
    const f = await farmer('+905550000042', {
      name: 'Soran',
      province: 'Gaziantep',
      district: 'Şahinbey',
      cropId: 'antep-fistigi',
    });
    await sql(
      `INSERT INTO push_tokens(user_id, token, platform) VALUES ($1, 'ExponentPushToken[g24test]', 'android')`,
      [f.userId],
    );
    const ask = await call('POST', '/pusula/ask', f.token, {
      question: 'Fıstık yapraklarında sarı lekeler var, ne olabilir?',
      fieldId: f.fieldId,
      image: {
        mime: 'image/png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
    });
    const qid = ask.body.card.expertQuestionId as string;
    expect(qid).toBeTruthy();
    const [row] = await sql<{ assigned_to: string; district: string }>(
      'SELECT assigned_to, district FROM expert_questions WHERE id = $1',
      [qid],
    );
    expect(row!.assigned_to).toBe(uzman.userId);
    expect(row!.district).toBe('Şahinbey');

    const q1 = await call('GET', '/pusula/queue', uzman.token);
    const item = q1.body.find((x: { id: string }) => x.id === qid);
    expect(item.mine).toBe(true);
    expect(item.hasImage).toBe(true);
    expect(item.cropName).toBe('Antep fıstığı');
    const img = await call('GET', `/pusula/queue/${qid}/image`, uzman.token);
    expect(img.body.mime).toBe('image/png');
    // Başka ilin uzmanı bu soruyu görmez ve cevaplayamaz.
    const q2 = await call('GET', '/pusula/queue', baska.token);
    expect(q2.body.some((x: { id: string }) => x.id === qid)).toBe(false);
    const steal = await call('POST', `/pusula/queue/${qid}/answer`, baska.token, {
      answer: 'Yaprak lekesi olabilir.',
      source: 'Kaynak',
      cacheable: false,
    });
    expect(steal.status).toBe(403);

    const ans = await call('POST', `/pusula/queue/${qid}/answer`, uzman.token, {
      answer: 'Bu belirtiler yaprak lekesi hastalığına benziyor; ilçe müdürlüğüne örnek getirin.',
      source: 'Şahinbey İlçe Tarım, saha gözlemi',
      cacheable: false,
    });
    expect(ans.status).toBe(200);
    const my = await call('GET', '/pusula/my', f.token);
    expect(my.body[0].status).toBe('cevaplandi');
    const inbox = await call('GET', '/me/notifications', f.token);
    expect(inbox.body[0]).toMatchObject({ kind: 'uzman_cevap', refId: qid, readAt: null });
    expect(push.sent.some((m) => m.to === 'ExponentPushToken[g24test]')).toBe(true);
    await call('POST', '/me/notifications/read', f.token);
    expect((await call('GET', '/me/notifications', f.token)).body[0].readAt).not.toBeNull();
    // Uzmanın cevapladıkları.
    const done = await call('GET', '/pusula/answered', uzman.token);
    expect(done.body[0].id).toBe(qid);
  });
});
