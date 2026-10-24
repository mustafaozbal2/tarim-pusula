/* eslint-disable @typescript-eslint/no-explicit-any -- testlerde yanıt gövdesi serbest biçimli */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { Places } from './places';
import { EXPORT_COVERAGE } from './wallet';

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
  return { status: res.status, body: text ? (JSON.parse(text) as any) : undefined };
}
async function login(phone: string) {
  await call('POST', '/auth/otp/request', undefined, { phone });
  const r = await call('POST', '/auth/otp/verify', undefined, { phone, code: sms.lastCode(phone) });
  return r.body as { token: string; userId: string };
}
const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  systemTx(db, (q) => q.query<T>(text, params));

let ali: Awaited<ReturnType<typeof login>>;
let veli: Awaited<ReturnType<typeof login>>;
let can: Awaited<ReturnType<typeof login>>;
let expert: Awaited<ReturnType<typeof login>>;
let aliField: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({ db, sms, auth: { otpSecret: 'test' }, places: Places.load() }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login('+905321200001');
  veli = await login('+905321200002');
  can = await login('+905321200003');
  expert = await login('+905321200004');
  await sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
    expert.userId,
    'expert',
  ]);
  await sql('UPDATE sessions SET mfa_at = now() WHERE user_id = $1', [expert.userId]);
  const f = await call('POST', '/fields', ali.token, { name: 'Zeytinlik', lat: 37.1, lon: 37.4 });
  aliField = f.body.id;
  await sql(
    `UPDATE fields SET province = 'Gaziantep', district = 'Nizip', crop_id = 'zeytin', area_decare = 50
     WHERE id = $1`,
    [aliField],
  );
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('uygunluk: onay kapısı ve hesap', () => {
  const q = '/suitability?ph=6&yillik-yagis=500';

  it('giriş gerekir', async () => {
    expect((await call('GET', q)).status).toBe(401);
  });
  it('tohum faktörleri taslaktır: hiçbir üründe skor yok, rozet var, sıralama boş', async () => {
    const r = await call('GET', q, ali.token);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(4);
    expect(r.body.ranking).toEqual([]);
    for (const it of r.body.items) {
      expect(it.suitability).toMatchObject({ kind: 'none', reason: 'onaysiz-faktor', badge: true });
      expect(it.sources[0]).toMatchObject({ version: 'taslak-2026-10-19', date: '2026-10-19' });
    }
  });
  it('sayısal olmayan ölçüm 400', async () => {
    expect((await call('GET', '/suitability?ph=abc', ali.token)).status).toBe(400);
    expect((await call('GET', '/suitability?PH=6', ali.token)).status).toBe(400);
  });
  it('çiftçi onaylayamaz; MFA’sız uzman onaylayamaz; MFA’lı uzman onaylar', async () => {
    const list = await call('GET', '/suitability/factors', expert.token);
    expect(list.status).toBe(200);
    const zeytin = list.body.filter((f: any) => f.cropId === 'zeytin');
    expect(zeytin).toHaveLength(3);
    expect(
      (await call('POST', `/suitability/factors/${zeytin[0].id}/approve`, ali.token)).status,
    ).toBe(403);
    expect((await call('GET', '/suitability/factors', ali.token)).status).toBe(403);
    await sql('UPDATE sessions SET mfa_at = NULL WHERE user_id = $1', [expert.userId]);
    expect(
      (await call('POST', `/suitability/factors/${zeytin[0].id}/approve`, expert.token)).status,
    ).toBeGreaterThanOrEqual(401);
    await sql('UPDATE sessions SET mfa_at = now() WHERE user_id = $1', [expert.userId]);
    for (const f of zeytin) {
      expect(
        (await call('POST', `/suitability/factors/${f.id}/approve`, expert.token)).status,
      ).toBe(200);
    }
  });
  it('onaylı zeytin: elle hesap (pH 6 → 0,5; yağış 500 → 1; skor √0,5); yalnız zeytin sıralanır', async () => {
    const r = await call('GET', q, ali.token);
    expect(r.body.ranking).toEqual(['zeytin']);
    const z = r.body.items.find((i: any) => i.cropId === 'zeytin').suitability;
    expect(z.kind).toBe('score');
    expect(z.score).toBeCloseTo(Math.SQRT1_2, 9);
    expect(z.cls).toBe('uygun');
    expect(z.limiting.key).toBe('ph');
    expect(z.missing).toEqual(['yillik-sicaklik']); // bilinmeyen ölçüm uydurulmadı
    const other = r.body.items.find((i: any) => i.cropId === 'pamuk').suitability;
    expect(other.kind).toBe('none');
  });
  it('tek ölçümle skor yok', async () => {
    const r = await call('GET', '/suitability?ph=7', ali.token);
    const z = r.body.items.find((i: any) => i.cropId === 'zeytin').suitability;
    expect(z).toMatchObject({ kind: 'none', reason: 'yetersiz-veri' });
  });
});

describe('ekonomik katman aralıklıdır ve girdisiz verilmez', () => {
  const econ = '&crop=zeytin&yieldLow=300&yieldHigh=500&costLow=2000&costHigh=3000';
  it('fiyat kaydı yoksa aralık yok, gerekçe var', async () => {
    const r = await call('GET', `/suitability?ph=7&yillik-yagis=500${econ}`, ali.token);
    const z = r.body.items.find((i: any) => i.cropId === 'zeytin');
    expect(z.economic).toBeNull();
    expect(r.body.economicNote).toMatch(/yetersiz/);
  });
  it('verim/maliyet girilmediyse uydurulmaz', async () => {
    const r = await call('GET', '/suitability?ph=7&yillik-yagis=500&crop=zeytin', ali.token);
    expect(r.body.economicNote).toMatch(/girin/);
  });
  it('kaynaklı fiyat yeterliyse P10-P90 aralığı: elle hesap', async () => {
    await sql(
      `INSERT INTO market_sources(id, name, license_note) VALUES ('t11','Test Hal','test')`,
    );
    await sql(`INSERT INTO market_places(id, source_id, name) VALUES ('p11','t11','Test Hal')`);
    // Son 90 gün içinde 11 farklı gün: 10..20 TL/kg (min=max). P10=11, P90=19.
    for (let i = 0; i <= 10; i++) {
      await sql(
        `INSERT INTO market_prices(source_id, place_id, crop_id, product_name, price_min, price_max,
           price_date, fetched_at, source_version, source_url, raw_sha256)
         VALUES ('t11','p11','zeytin','Zeytin',$1,$1, (now() at time zone 'Europe/Istanbul')::date - $2::int,
           now(),'v1','https://x.test',$3)`,
        [10 + i, i, 'a'.repeat(64)],
      );
    }
    const r = await call('GET', `/suitability?ph=7&yillik-yagis=500${econ}`, ali.token);
    const e = r.body.items.find((i: any) => i.cropId === 'zeytin').economic;
    expect(e.low).toBeCloseTo(11 * 300 - 3000, 6);
    expect(e.high).toBeCloseTo(19 * 500 - 2000, 6);
    expect(e.isPredictionInterval).toBe(false);
    expect(r.body.economicNote).toBeNull();
    // Başka ürüne aralık sızmaz.
    expect(r.body.items.find((i: any) => i.cropId === 'pamuk').economic).toBeNull();
  });
});

describe('destekler', () => {
  it('tohum destekleri taslak: rozetli, "onay-bekliyor", kaynak+tarih+sürüm var', async () => {
    const r = await call('GET', '/supports', ali.token);
    expect(r.status).toBe(200);
    expect(r.body.matches).toHaveLength(4);
    for (const m of r.body.matches) {
      expect(m.badge).toBe(true);
      expect(m.status).toBe('onay-bekliyor');
      expect(m.support.source).toBeTruthy();
      expect(m.support.sourceDate).toBe('2026-10-19');
      expect(m.support.sourceVersion).toBe('taslak-2026-10-19');
    }
  });
  it('tarla seçilince eşleşir; başkasının tarlası 403', async () => {
    expect(
      (await call('GET', `/supports?fieldId=${aliField}`, ali.token)).body.matches,
    ).toHaveLength(4);
    expect((await call('GET', `/supports?fieldId=${aliField}`, veli.token)).status).toBe(403);
  });
  it('uzman onaylayınca rozet kalkar; çiftçi onaylayamaz', async () => {
    expect((await call('POST', '/supports/mazot-gubre/approve', ali.token)).status).toBe(403);
    expect((await call('POST', '/supports/mazot-gubre/approve', expert.token)).status).toBe(200);
    const r = await call('GET', '/supports', ali.token);
    const m = r.body.matches.find((x: any) => x.support.id === 'mazot-gubre');
    expect(m).toMatchObject({ badge: false, status: 'donem-bilinmiyor' });
    expect(r.body.matches.at(-1).badge).toBe(true); // taslaklar sonda
  });
  it('kaynaksız destek veritabanında tutulamaz', async () => {
    await expect(
      sql(
        `INSERT INTO supports(id, title, summary, source, source_version, source_date)
         VALUES ('x','t','s','  ','v','2026-01-01')`,
      ),
    ).rejects.toThrow();
  });
});

describe('veri cüzdanı: dışa aktarma tüm kullanıcı verisini içerir', () => {
  it('şemadaki her kullanıcı tablosu dışa aktarmaya eşlenmiş ya da gerekçeyle hariç', async () => {
    const rows = await sql<{ t: string }>(
      `SELECT DISTINCT c.conrelid::regclass::text AS t
       FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass`,
    );
    const missing = rows.map((r) => r.t).filter((t) => !(t in EXPORT_COVERAGE));
    expect(missing).toEqual([]);
  });

  it('her kategoride veri varken tüm anahtarlar dolu gelir; başkasının verisi yok', async () => {
    const dev = (
      await sql<{ id: string }>(
        `INSERT INTO devices(field_id, name) VALUES ($1,'Vana') RETURNING id`,
        [aliField],
      )
    )[0]!;
    await sql(
      `INSERT INTO irrigation_commands(device_id, field_id, user_id, action, minutes, idempotency_key,
         created_at, expires_at) VALUES ($1,$2,$3,'open',10,'idem-12345678', now(), now() + interval '1 minute')`,
      [dev.id, aliField, ali.userId],
    );
    const qn = (
      await sql<{ id: string }>(
        `INSERT INTO expert_questions(user_id, question, question_norm, reason, has_image)
         VALUES ($1,'Yaprak sararıyor','yaprak sararıyor','foto', true) RETURNING id`,
        [ali.userId],
      )
    )[0]!;
    await sql(
      `INSERT INTO expert_question_images(question_id, mime, data) VALUES ($1,'image/png', '\\x89504e47')`,
      [qn.id],
    );
    await sql(
      `INSERT INTO push_tokens(user_id, token, platform) VALUES ($1,'ExponentPushToken[aaaa]','android')`,
      [ali.userId],
    );
    const code = (
      await sql<{ id: string }>(
        `INSERT INTO nearby_codes(owner_id, code, expires_at) VALUES ($1,'123456', now() + interval '1 day') RETURNING id`,
        [ali.userId],
      )
    )[0]!;
    await sql(
      `INSERT INTO nearby_proposals(code_id, owner_id, helper_id, payload) VALUES ($1,$2,$3,'{"name":"x"}')`,
      [code.id, ali.userId, veli.userId],
    );
    await call('POST', '/me/consents', ali.token, {
      purpose: 'konum-isleme',
      granted: true,
      policyVersion: '1',
    });
    await call('POST', '/fields/' + aliField + '/access', ali.token, {
      userId: can.userId,
      level: 'read',
    });
    await call('POST', '/fields', veli.token, { name: 'Veli Tarlası', lat: 38, lon: 38 });
    await call('POST', '/me/shares', ali.token, {
      recipientId: veli.userId,
      categories: ['questions'],
      purpose: 'Danışmanlık',
      days: 30,
    });

    const r = await call('GET', '/me/export', ali.token);
    expect(r.status).toBe(200);
    const keys = new Set(
      Object.values(EXPORT_COVERAGE).flatMap((v) => ('key' in v ? [v.key] : [])),
    );
    for (const k of keys) {
      const v = r.body[k];
      expect(v, `export anahtarı eksik: ${k}`).toBeDefined();
      if (k !== 'profile') expect(Array.isArray(v) ? v.length : 1, `boş: ${k}`).toBeGreaterThan(0);
    }
    expect(r.body.expertQuestionImages[0]).toMatchObject({
      mime: 'image/png',
      dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    });
    expect(r.body.fieldAccess[0]).toMatchObject({ userId: can.userId, level: 'read' });
    expect(r.body.irrigationCommands[0]).toMatchObject({ action: 'open', minutes: 10 });
    expect(r.body.dataShares[0].categories).toEqual(['questions']);
    expect(JSON.stringify(r.body)).not.toContain('Veli Tarlası');
    // Sır ve oturum verisi aktarılmaz.
    expect(JSON.stringify(r.body)).not.toContain(ali.token);
  });

  it('yalnız kendi kayıtları: başka kullanıcının dışa aktarması alınan komut/soruyu içermez', async () => {
    const r = await call('GET', '/me/export', veli.token);
    expect(r.body.irrigationCommands).toEqual([]);
    expect(r.body.expertQuestions).toEqual([]);
    expect(r.body.fields.map((f: any) => f.name)).toEqual(['Veli Tarlası']);
  });

  it('cüzdan özeti sayıları verir ve paylaşım kimliğini gösterir', async () => {
    const r = await call('GET', '/me/wallet', ali.token);
    expect(r.body.shareId).toBe(ali.userId);
    const by = Object.fromEntries(r.body.categories.map((c: any) => [c.key, c.count]));
    expect(by).toMatchObject({ profile: 1, fields: 1, devices: 1, irrigation: 1, questions: 1 });
    expect(r.body.given).toHaveLength(1);
    expect(r.body.given[0].active).toBe(true);
  });
});

describe('veri cüzdanı: paylaşım izinleri', () => {
  const share = (token: string, body: unknown) => call('POST', '/me/shares', token, body);

  it('kapsam dışı kategori görünmez: yalnız "questions" paylaşılmış, tarla görünmez', async () => {
    expect((await call('GET', '/shared/fields', veli.token)).body).toEqual([]);
  });
  it('doğrulama: kendine, bilinmeyen alıcıya, 365+ güne, boş/yanlış kategoriye izin yok', async () => {
    const ok = {
      recipientId: veli.userId,
      categories: ['fields'],
      purpose: 'Kooperatif',
      days: 30,
    };
    expect((await share(ali.token, { ...ok, recipientId: ali.userId })).status).toBe(400);
    expect(
      (await share(ali.token, { ...ok, recipientId: '00000000-0000-4000-8000-000000000000' }))
        .status,
    ).toBe(400);
    expect((await share(ali.token, { ...ok, days: 366 })).status).toBe(400);
    expect((await share(ali.token, { ...ok, categories: [] })).status).toBe(400);
    expect((await share(ali.token, { ...ok, categories: ['sifre'] })).status).toBe(400);
    expect((await share(ali.token, { ...ok, purpose: ' ' })).status).toBe(400);
    expect((await share(undefined as any, ok)).status).toBe(401);
  });
  it('paylaşım → alıcı ilçe düzeyinde özet görür (koordinat yok) → geri alınca kaybolur', async () => {
    const c = await share(ali.token, {
      recipientId: veli.userId,
      categories: ['fields'],
      purpose: 'Kooperatif kaydı',
      days: 30,
    });
    expect(c.status).toBe(201);
    const seen = await call('GET', '/shared/fields', veli.token);
    expect(seen.body).toHaveLength(1);
    expect(seen.body[0]).toMatchObject({
      ownerId: ali.userId,
      fieldId: aliField,
      province: 'Gaziantep',
      district: 'Nizip',
      cropId: 'zeytin',
    });
    expect(seen.body[0]).not.toHaveProperty('lat');
    expect(seen.body[0]).not.toHaveProperty('lon');
    // Alıcı olmayan görmez; alıcı geri alamaz; sahip olmayan geri alamaz.
    expect((await call('GET', '/shared/fields', can.token)).body).toEqual([]);
    expect((await call('DELETE', `/me/shares/${c.body.id}`, veli.token)).status).toBe(403);
    expect((await call('DELETE', `/me/shares/${c.body.id}`, can.token)).status).toBe(403);
    expect((await call('GET', '/me/wallet', can.token)).body.given).toEqual([]);
    expect((await call('DELETE', `/me/shares/${c.body.id}`, ali.token)).status).toBe(204);
    expect((await call('GET', '/shared/fields', veli.token)).body).toEqual([]);
    // İkinci geri alma: kayıt artık etkin değil.
    expect((await call('DELETE', `/me/shares/${c.body.id}`, ali.token)).status).toBe(403);
    const w = await call('GET', '/me/wallet', ali.token);
    expect(w.body.given.find((s: any) => s.id === c.body.id).active).toBe(false);
  });
  it('süresi dolan paylaşım hiçbir şey göstermez', async () => {
    await sql(
      `INSERT INTO data_shares(owner_id, recipient_id, categories, purpose, created_at, expires_at)
       VALUES ($1,$2,'{fields}','Eski', now() - interval '10 days', now() - interval '1 day')`,
      [ali.userId, can.userId],
    );
    expect((await call('GET', '/shared/fields', can.token)).body).toEqual([]);
    const w = await call('GET', '/me/wallet', can.token);
    expect(w.body.received[0].active).toBe(false);
  });
  it('alıcı paylaşım kaydını değiştiremez (yalnız sahibi geri alır)', async () => {
    const [row] = await sql<{ id: string }>(
      `INSERT INTO data_shares(owner_id, recipient_id, categories, purpose, expires_at)
       VALUES ($1,$2,'{fields}','Deneme', now() + interval '5 days') RETURNING id`,
      [ali.userId, veli.userId],
    );
    expect((await call('DELETE', `/me/shares/${row!.id}`, veli.token)).status).toBe(403);
    expect((await call('GET', '/shared/fields', veli.token)).body).toHaveLength(1);
  });
});
