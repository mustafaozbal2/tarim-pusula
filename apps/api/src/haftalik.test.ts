/* eslint-disable @typescript-eslint/no-explicit-any -- testlerde yanıt gövdesi serbest biçimli */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NotificationJob } from '@tarim/workers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
import { DataService } from './data.service';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { ozetSatiri, type HaftalikOzet } from './haftalik';
import { Places } from './places';
import { NotifyService } from './weather/notify';

const db = createTestDb();
const sms = new FakeSmsProvider();
const places = Places.load();
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
const TR_BUGUN = `(now() at time zone 'Europe/Istanbul')::date`;

let ali: Awaited<ReturnType<typeof login>>;
let veli: Awaited<ReturnType<typeof login>>;
let aliField: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({ db, sms, auth: { otpSecret: 'test' }, places }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login('+905321300001');
  veli = await login('+905321300002');
  aliField = (await call('POST', '/fields', ali.token, { name: 'Zeytinlik', lat: 37.1, lon: 37.4 }))
    .body.id;
  await sql(
    `UPDATE fields SET province = 'Gaziantep', crop_id = 'zeytin', area_decare = 50 WHERE id = $1`,
    [aliField],
  );
  // Açık destek (Gaziantep, 10 gün sonra kapanır), başka ilin desteği ve onaysız taslak.
  await sql(
    `INSERT INTO supports(id, title, summary, provinces, apply_from, apply_to, review_status, source,
       source_url, source_version, source_date) VALUES
     ('hw-acik','Zeytin fidanı hibesi','ozet','{Gaziantep}', ${TR_BUGUN} - 10, ${TR_BUGUN} + 10,
       'uzman-onayli','İl Tarım Müdürlüğü','https://tarim.test/hibe','v1','2026-11-01'),
     ('hw-baska','Başka il','ozet','{İzmir}', ${TR_BUGUN} - 5, ${TR_BUGUN} + 10,
       'uzman-onayli','İl Tarım','https://x.test','v1','2026-11-01')`,
  );
  // Hal fiyatı: 7 gün önce 10 TL, bugün 12 TL (+%20).
  await sql(
    `INSERT INTO market_sources(id, name, license_note) VALUES ('hw','Gaziantep Hali','test')`,
  );
  await sql(
    `INSERT INTO market_places(id, source_id, name, province) VALUES ('hw-p','hw','Gaziantep Hali','Gaziantep')`,
  );
  for (const [gun, fiyat] of [
    [0, 12],
    [7, 10],
  ]) {
    await sql(
      `INSERT INTO market_prices(source_id, place_id, crop_id, product_name, price_min, price_max,
         price_date, fetched_at, source_version, source_url, raw_sha256)
       VALUES ('hw','hw-p','zeytin','Zeytin',$1,$1, ${TR_BUGUN} - $2::int, now(),'v1','https://hal.test',$3)`,
      [fiyat, gun, 'b'.repeat(64)],
    );
  }
  // Geçen haftanın uyarıları: aynı don iki kaynaktan + SMS kopyası tek sayılır.
  const gun = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  for (const k of [
    `frost:${aliField}:${gun}`,
    `hava-don:${aliField}:${gun}`,
    `sms:hava-don:${aliField}:${gun}`,
  ])
    await sql(`INSERT INTO notification_log(dedupe_key, user_id, kind) VALUES ($1,$2,'frost')`, [
      k,
      ali.userId,
    ]);
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('haftalık özet', () => {
  it('giriş gerekir', async () => {
    expect((await call('GET', '/me/haftalik-ozet')).status).toBe(401);
  });

  it('il ve ürüne göre açık destek, yaklaşan son gün, geçen haftanın uyarısı, fiyat değişimi', async () => {
    const r = await call('GET', '/me/haftalik-ozet', ali.token);
    expect(r.status).toBe(200);
    const o = r.body as HaftalikOzet;
    expect(o.hafta).toMatch(/^\d{4}-W\d{2}$/);
    expect(o.destekler.map((d) => d.id)).toEqual(['hw-acik']);
    expect(o.destekler[0]).toMatchObject({
      kaynak: 'İl Tarım Müdürlüğü',
      kaynakUrl: 'https://tarim.test/hibe',
      tarlalar: ['Zeytinlik'],
    });
    expect(o.tarihler).toEqual([
      expect.objectContaining({ tur: 'basvuru', tarih: o.destekler[0]!.sonGun }),
    ]);
    expect(o.uyarilar).toEqual([expect.objectContaining({ tur: 'don', tarla: 'Zeytinlik' })]);
    expect(o.fiyatlar).toEqual([
      expect.objectContaining({ cropId: 'zeytin', son: 12, onceki: 10, degisimPct: 20 }),
    ]);
    expect(ozetSatiri(o)).toBe(
      '1 açık başvuru, 1 yaklaşan tarih, geçen hafta 1 uyarı (don), zeytin %20 arttı',
    );
  });

  it('son günü 3 gün içindeki başvuru bildirimde ayrıca söylenir', () => {
    const o: HaftalikOzet = {
      hafta: '2026-W48',
      bugun: '2026-11-24',
      destekler: [
        {
          id: 'a',
          baslik: 'A',
          sonGun: '2026-11-26',
          kaynak: 'K',
          kaynakTarihi: '2026-11-01',
          kaynakUrl: null,
          tarlalar: ['T'],
        },
        {
          id: 'b',
          baslik: 'B',
          sonGun: '2026-12-20',
          kaynak: 'K',
          kaynakTarihi: '2026-11-01',
          kaynakUrl: null,
          tarlalar: ['T'],
        },
      ],
      tarihler: [],
      uyarilar: [],
      fiyatlar: [],
      not: null,
    };
    expect(ozetSatiri(o)).toBe('2 açık başvuru, 1 başvurunun son günü 3 gün içinde');
  });

  it('başkasının verisi görünmez; arazisi olmayana yol gösterir', async () => {
    const r = await call('GET', '/me/haftalik-ozet', veli.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ destekler: [], uyarilar: [], fiyatlar: [] });
    expect(r.body.not).toMatch(/arazi ekleyin/);
    expect(ozetSatiri(r.body)).toBeNull();
  });

  it('haftalık bildirim: pazartesi sabah bir kez, yalnız telefonu kayıtlı ve özeti dolu olana', async () => {
    await sql(
      `INSERT INTO push_tokens(user_id, token, platform) VALUES ($1,'ExponentPushToken[hw-ali]','android'),
      ($2,'ExponentPushToken[hw-veli]','android')`,
      [ali.userId, veli.userId],
    );
    const isler: NotificationJob[] = [];
    const kuyruk = {
      enqueue: async (j: NotificationJob) => {
        isler.push(j);
        await sql(`INSERT INTO notification_log(dedupe_key, user_id, kind) VALUES ($1,$2,'info')`, [
          j.dedupeKey,
          j.userId,
        ]);
      },
      process: async () => async () => undefined,
    };
    const yap = (saat: Date) =>
      new NotifyService(
        app.get(DataService),
        {} as never,
        () => saat,
        kuyruk,
        {} as never,
        undefined,
        undefined,
        places,
      ).scanHaftalik();
    // Bugüne en yakın geçmiş pazartesi, yerel 10:00 (UTC 07:00): fiyat ve destek verisi hâlâ geçerli.
    const p = new Date();
    p.setUTCDate(p.getUTCDate() - ((p.getUTCDay() + 6) % 7));
    p.setUTCHours(7, 0, 0, 0);
    await yap(p);
    expect(isler).toHaveLength(1);
    expect(isler[0]).toMatchObject({
      userId: ali.userId,
      title: 'Haftalık özetiniz hazır',
      data: { kind: 'haftalik' },
    });
    expect(isler[0]!.body).toContain('1 açık başvuru');
    expect((await yap(p)).queued).toBe(0); // aynı hafta ikinci kez gitmez
    const sali = new Date(p.getTime() + 86_400_000);
    expect((await yap(sali)).checked).toBe(0);
  });
});
