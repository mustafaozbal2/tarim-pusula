import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { foldTr, Places } from './places';

const db = createTestDb();
const sms = new FakeSmsProvider();
let app: INestApplication;
let base: string;

const FARMER = '+905321110001';
const HELPER = '+905321110002';
const STRANGER = '+905321110003';

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
  expect(r.status).toBe(200);
  return r.body as { token: string; userId: string };
}

const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  systemTx(db, (q) => q.query<T>(text, params));

let farmer: Awaited<ReturnType<typeof login>>;
let helper: Awaited<ReturnType<typeof login>>;
let stranger: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(AppModule.register({ db, sms, auth: { otpSecret: 'test' } }), {
    logger: false,
  });
  await app.listen(0);
  base = await app.getUrl();
  farmer = await login(FARMER);
  helper = await login(HELPER);
  stranger = await login(STRANGER);
});
afterAll(async () => {
  await app.close();
  await db.close();
});

// 100 m × 100 m ≈ 10 dekar (Gaziantep enlemi)
const SQUARE_10_DECARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [37.38, 37.06],
      [37.381127, 37.06],
      [37.381127, 37.060901],
      [37.38, 37.060901],
      [37.38, 37.06],
    ],
  ],
};

describe('tarla: konum, sınır, alan', () => {
  it('nokta konum zorunlu', async () => {
    const r = await call('POST', '/fields', farmer.token, { name: 'Konumsuz' });
    expect(r.status).toBe(400);
  });

  it('yalnız nokta ile kaydolur; konum yolu saklanır', async () => {
    const r = await call('POST', '/fields', farmer.token, {
      name: 'Nokta tarla',
      lat: 37.06,
      lon: 37.38,
      locationSource: 'gps',
      parcelBlock: '101',
      parcelNo: '7',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      locationSource: 'gps',
      parcelBlock: '101',
      parcelNo: '7',
      boundary: null,
      areaDecare: null,
    });
  });

  it('sınır çizilirse alan sunucuda dekar olarak hesaplanır; istemcinin yazdığı alan yok sayılır', async () => {
    const r = await call('POST', '/fields', farmer.token, {
      name: 'Sınırlı tarla',
      lat: 37.0605,
      lon: 37.3805,
      areaDecare: 999,
      boundary: SQUARE_10_DECARE,
    });
    expect(r.status).toBe(201);
    expect(r.body.areaDecare).toBeGreaterThan(9.9);
    expect(r.body.areaDecare).toBeLessThan(10.1);
    expect(r.body.boundary.type).toBe('Polygon');
  });

  it('sınır güncellenince alan yeniden hesaplanır; sınır silinince kalır', async () => {
    const f = (await call('POST', '/fields', farmer.token, { name: 'G', lat: 37.06, lon: 37.38 }))
      .body;
    const u = await call('PATCH', `/fields/${f.id}`, farmer.token, { boundary: SQUARE_10_DECARE });
    expect(u.status).toBe(200);
    expect(u.body.areaDecare).toBeCloseTo(10, 0);
    const cleared = await call('PATCH', `/fields/${f.id}`, farmer.token, { boundary: null });
    expect(cleared.body.boundary).toBeNull();
  });

  it('kendini kesen sınır 400', async () => {
    const bow = {
      type: 'Polygon',
      coordinates: [
        [
          [37, 37],
          [37.001, 37.001],
          [37.001, 37],
          [37, 37.001],
          [37, 37],
        ],
      ],
    };
    const r = await call('POST', '/fields', farmer.token, {
      name: 'K',
      lat: 37,
      lon: 37,
      boundary: bow,
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/kesiyor/);
  });

  it('aynı clientId ile tekrar gönderim çift kayıt açmaz (çevrimdışı sıra)', async () => {
    const clientId = '5b0f2b0e-7c37-4a3a-9d55-5d3d6d6b9a10';
    const body = { name: 'Sıradan', lat: 37.1, lon: 37.4, clientId, locationSource: 'koy' };
    const a = await call('POST', '/fields', farmer.token, body);
    const b = await call('POST', '/fields', farmer.token, body);
    expect(a.body.id).toBe(b.body.id);
    const all = (await call('GET', '/fields', farmer.token)).body as { clientId: string }[];
    expect(all.filter((f) => f.clientId === clientId)).toHaveLength(1);
  });

  it('başkasının tarlası değiştirilemez', async () => {
    const f = (await call('POST', '/fields', farmer.token, { name: 'X', lat: 37, lon: 37 })).body;
    const r = await call('PATCH', `/fields/${f.id}`, stranger.token, { name: 'Ele geçir' });
    expect(r.status).toBe(403);
  });
});

describe('il > ilçe > köy', () => {
  it('veri tablosu 81 il ve on binlerce yerleşim içerir', () => {
    const p = Places.load();
    expect(p.provinces()).toHaveLength(81);
    expect(p.size).toBeGreaterThan(30_000);
  });

  it('Türkçe harfe duyarsız eşleşir', () => {
    expect(foldTr('Şanlıurfa')).toBe(foldTr('SANLIURFA'));
    expect(foldTr('IĞDIR')).toBe('igdir');
  });

  it('uç noktalar: il → ilçe → köy ve koordinat', async () => {
    const provs = (await call('GET', '/places/provinces', farmer.token)).body as string[];
    expect(provs).toEqual(expect.arrayContaining(['Gaziantep', 'Şanlıurfa', 'Adıyaman', 'Kilis']));
    const districts = (await call('GET', '/places/districts?province=Gaziantep', farmer.token))
      .body as string[];
    expect(districts).toEqual(expect.arrayContaining(['Nizip', 'Araban']));
    const villages = (
      await call(
        'GET',
        `/places/villages?province=Gaziantep&district=${encodeURIComponent('Nizip')}`,
        farmer.token,
      )
    ).body as { name: string; lat: number; lon: number }[];
    expect(villages.length).toBeGreaterThan(5);
    for (const v of villages) {
      expect(v.lat).toBeGreaterThan(36);
      expect(v.lat).toBeLessThan(38);
      expect(v.lon).toBeGreaterThan(36);
      expect(v.lon).toBeLessThan(38.5);
    }
  });

  it('giriş gerekir; eksik parametre 400', async () => {
    expect((await call('GET', '/places/provinces')).status).toBe(401);
    expect((await call('GET', '/places/districts', farmer.token)).status).toBe(400);
  });
});

describe('Bitki Bilgi Paketi', () => {
  it('tüm ürünler listelenir; yaygın 6 ürün sıralıdır', async () => {
    const r = await call('GET', '/crops', farmer.token);
    expect(r.status).toBe(200);
    const crops = r.body as { id: string; commonRank: number | null }[];
    expect(crops.length).toBeGreaterThanOrEqual(40);
    expect(crops.filter((c) => c.commonRank !== null).map((c) => c.id)).toEqual([
      'antep-fistigi',
      'zeytin',
      'bugday',
      'pamuk',
      'domates',
      'arpa',
    ]);
    // Kc verisi olmayan ürün de listelenir
    expect(crops.map((c) => c.id)).toContain('incir');
  });

  it('Kc tablosu ve toprak listesi salt okunur, taslaklar rozetli', async () => {
    const kc = await call('GET', '/crops/kc-table', farmer.token);
    expect(kc.status).toBe(200);
    const rows = kc.body as { id: string; kcMid: number | null; needsBadge: boolean }[];
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.find((r) => r.id === 'zeytin')?.kcMid).not.toBeNull();
    expect(rows.every((r) => r.needsBadge)).toBe(true); // tohum hep taslak
    expect((await call('GET', '/crops/kc-table')).status).toBe(401);
    const soils = (await call('GET', '/soils', farmer.token)).body as {
      key: string;
      thetaFc: number;
      thetaWp: number;
      needsBadge: boolean;
    }[];
    expect(soils.map((x) => x.key)).toEqual(['kumlu', 'tinli', 'killi']);
    expect(soils.every((x) => x.thetaFc > x.thetaWp && x.needsBadge)).toBe(true);
  });

  it('tohum içe aktarılır: 33 paket, hepsi taslak, rozet açık, karar yok', async () => {
    const packs = await sql<{ n: string; approved: string }>(
      `SELECT count(*)::text n, count(*) FILTER (WHERE review_status = 'uzman-onayli')::text approved
       FROM crop_pack_versions`,
    );
    expect(packs[0]).toEqual({ n: '33', approved: '0' });
    const list = (await call('GET', '/crops', farmer.token)).body as {
      needsBadge: boolean;
      canDriveAdvice: boolean;
    }[];
    expect(list.every((c) => c.needsBadge && !c.canDriveAdvice)).toBe(true);
  });

  it('paket ayrıntısı kaynak + tarih + sürüm taşır', async () => {
    const r = await call('GET', '/crops/antep-fistigi', farmer.token);
    expect(r.body.pack).toMatchObject({ version: 1, reviewStatus: 'taslak-uzman-onayi-bekliyor' });
    expect(r.body.pack.source).toMatch(/FAO-56/);
    expect(r.body.pack.sourceVersion).toBeTruthy();
    expect(r.body.pack.retrievedAt).toBeTruthy();
    expect(r.body.needsBadge).toBe(true);
    expect((await call('GET', '/crops/yok-boyle-urun', farmer.token)).status).toBe(404);
  });

  it('yeniden içe aktarma yeni sürüm açmaz (değişmedi)', async () => {
    const r = await importCropCatalog(db);
    expect(r.packsCreated).toBe(0);
    expect(r.packsUnchanged).toBe(33);
  });

  it('ONAYSIZ Kc ile su ihtiyacı/uyarı üretilmez, yüksek ET0 olsa bile', async () => {
    for (const crop of ['antep-fistigi', 'zeytin', 'bugday', 'pamuk', 'domates', 'arpa']) {
      for (const et0 of [0, 3, 8, 15]) {
        const r = await call('GET', `/crops/${crop}/water-need?et0=${et0}`, farmer.token);
        expect(r.status).toBe(200);
        expect(r.body.advice).toEqual({
          kind: 'none',
          reason: 'uzman-onayi-bekliyor',
          badge: true,
        });
        expect(JSON.stringify(r.body)).not.toMatch(/etcMmPerDay/);
      }
    }
    // Paketi olmayan ürün de karar üretmez
    const none = await call('GET', '/crops/incir/water-need?et0=6', farmer.token);
    expect(none.body.advice.kind).toBe('none');
  });

  it('ET0 doğrulanır', async () => {
    expect((await call('GET', '/crops/zeytin/water-need', farmer.token)).status).toBe(400);
    expect((await call('GET', '/crops/zeytin/water-need?et0=-1', farmer.token)).status).toBe(400);
    expect((await call('GET', '/crops/zeytin/water-need?et0=abc', farmer.token)).status).toBe(400);
  });

  it('uygulama rolü paketi değiştiremez; onay ancak sistem yoluyla olur, sonra hesap çıkar', async () => {
    const approvedBefore = await sql(
      `SELECT 1 FROM crop_pack_versions WHERE review_status = 'uzman-onayli'`,
    );
    expect(approvedBefore).toHaveLength(0);
    // tp_app yazma yetkisi yok
    await expect(
      systemTx(db, async (q) => {
        await q.exec('SET LOCAL ROLE tp_app');
        await q.query(`UPDATE crop_pack_versions SET review_status = 'uzman-onayli'`);
      }),
    ).rejects.toThrow();
    // değerler sürüm içinde değiştirilemez
    await expect(
      sql(`UPDATE crop_pack_versions SET kc_mid = 9 WHERE crop_id = 'zeytin'`),
    ).rejects.toThrow(/sürümü değiştirilemez/);

    await sql(
      `UPDATE crop_pack_versions SET review_status = 'uzman-onayli' WHERE crop_id = 'zeytin'`,
    );
    const r = await call('GET', '/crops/zeytin/water-need?et0=5', farmer.token);
    expect(r.body.advice.kind).toBe('water-need');
    expect(r.body.advice.etcMmPerDay).toBeCloseTo(r.body.advice.kc * 5, 10);
    // diğerleri hâlâ karar üretmez
    expect(
      (await call('GET', '/crops/pamuk/water-need?et0=5', farmer.token)).body.advice.kind,
    ).toBe('none');
    await sql(
      `UPDATE crop_pack_versions SET review_status = 'taslak-uzman-onayi-bekliyor' WHERE crop_id = 'zeytin'`,
    );
  });

  it('Kc değeri değişirse yeni sürüm açılır, eskisi kalır', async () => {
    await sql(`DELETE FROM crop_pack_versions WHERE crop_id = 'arpa'`);
    await sql(
      `INSERT INTO crop_pack_versions(crop_id, version, kc_ini, kc_mid, kc_end, source, source_version, retrieved_at)
       VALUES ('arpa', 1, 0.5, 1.0, 0.2, 'eski', '0', now())`,
    );
    const r = await importCropCatalog(db);
    expect(r.packsCreated).toBe(1);
    const v = await sql<{ version: number; kc_ini: string }>(
      `SELECT version, kc_ini FROM crop_pack_versions WHERE crop_id = 'arpa' ORDER BY version`,
    );
    expect(v.map((x) => x.version)).toEqual([1, 2]);
    expect(Number(v[1]!.kc_ini)).toBe(0.3);
  });
});

describe('Yakınım yapsın', () => {
  const NEARBY_FIELD = { name: 'Babamın bahçesi', lat: 37.06, lon: 37.38, province: 'Gaziantep' };
  let code: string;

  it('çiftçi 6 haneli, 24 saat geçerli kod alır; yeni kod eskisini iptal eder', async () => {
    const first = await call('POST', '/nearby/codes', farmer.token);
    expect(first.status).toBe(201);
    expect(first.body.code).toMatch(/^\d{6}$/);
    const ms = new Date(first.body.expiresAt).getTime() - Date.now();
    expect(ms).toBeGreaterThan(23.9 * 3600_000);
    expect(ms).toBeLessThanOrEqual(24 * 3600_000 + 5000);
    const second = await call('POST', '/nearby/codes', farmer.token);
    code = second.body.code;
    if (first.body.code !== code) {
      const old = await call('POST', '/nearby/claim', helper.token, {
        code: first.body.code,
        field: NEARBY_FIELD,
      });
      expect(old.status).toBe(404);
    }
  });

  it('yanlış kod 404; kişi kendi kodunu kullanamaz', async () => {
    const wrong = code === '000000' ? '000001' : '000000';
    expect(
      (await call('POST', '/nearby/claim', helper.token, { code: wrong, field: NEARBY_FIELD }))
        .status,
    ).toBe(404);
    expect(
      (await call('POST', '/nearby/claim', farmer.token, { code, field: NEARBY_FIELD })).status,
    ).toBe(404);
  });

  it('yakın kodla tarla önerir: tarla henüz oluşmaz, assistant rolü verilir, denetlenir', async () => {
    const before = ((await call('GET', '/fields', farmer.token)).body as unknown[]).length;
    const r = await call('POST', '/nearby/claim', helper.token, {
      code: code.slice(0, 3) + ' ' + code.slice(3),
      field: NEARBY_FIELD,
    });
    expect(r.status).toBe(201);
    expect(((await call('GET', '/fields', farmer.token)).body as unknown[]).length).toBe(before);
    expect((await call('GET', '/me', helper.token)).body.roles).toContain('assistant');
    const audit = await sql<{ action: string }>(
      `SELECT action FROM audit_log WHERE action LIKE 'nearby.%' ORDER BY seq`,
    );
    expect(audit.map((a) => a.action)).toContain('nearby.claim');
  });

  it('yalnız tarla sahibi onaylar; başkası 403', async () => {
    const list = (await call('GET', '/nearby/proposals', farmer.token)).body as {
      id: string;
      as: string;
    }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.as).toBe('owner');
    const id = list[0]!.id;
    expect(
      (await call('POST', `/nearby/proposals/${id}/decision`, stranger.token, { approve: true }))
        .status,
    ).toBe(403);
    expect(
      (await call('POST', `/nearby/proposals/${id}/decision`, helper.token, { approve: true }))
        .status,
    ).toBe(403);
    expect((await call('GET', '/nearby/proposals', stranger.token)).body).toEqual([]);
  });

  it('çiftçi onaylayınca tarla ÇİFTÇİNİN hesabında oluşur; yakın yalnız okuyabilir; çift onay yok', async () => {
    const id = ((await call('GET', '/nearby/proposals', farmer.token)).body as { id: string }[])[0]!
      .id;
    const ok = await call('POST', `/nearby/proposals/${id}/decision`, farmer.token, {
      approve: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('approved');
    expect(ok.body.field).toMatchObject({
      ownerId: farmer.userId,
      locationSource: 'yakin',
      name: 'Babamın bahçesi',
    });

    const fid = ok.body.field.id as string;
    const asHelper = await call('GET', `/fields/${fid}`, helper.token);
    expect(asHelper.status).toBe(200);
    expect((await call('PATCH', `/fields/${fid}`, helper.token, { name: 'Değiştir' })).status).toBe(
      403,
    );
    expect((await call('GET', `/fields/${fid}`, stranger.token)).status).toBe(403);

    const again = await call('POST', `/nearby/proposals/${id}/decision`, farmer.token, {
      approve: true,
    });
    expect(again.status).toBe(403);
    const audit = await sql<{ action: string }>(
      `SELECT action FROM audit_log WHERE action LIKE 'nearby.%'`,
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['nearby.approve', 'nearby.code.create']),
    );
  });

  it('reddedilen öneriden tarla oluşmaz', async () => {
    const c = (await call('POST', '/nearby/codes', farmer.token)).body.code as string;
    await call('POST', '/nearby/claim', helper.token, {
      code: c,
      field: { ...NEARBY_FIELD, name: 'Reddedilecek' },
    });
    const id = (
      (await call('GET', '/nearby/proposals', farmer.token)).body as {
        id: string;
        status: string;
      }[]
    ).find((p) => p.status === 'pending')!.id;
    const r = await call('POST', `/nearby/proposals/${id}/decision`, farmer.token, {
      approve: false,
    });
    expect(r.body).toMatchObject({ status: 'rejected', field: null });
    const names = ((await call('GET', '/fields', farmer.token)).body as { name: string }[]).map(
      (f) => f.name,
    );
    expect(names).not.toContain('Reddedilecek');
  });

  it('süresi dolan kod geçersizdir', async () => {
    const c = (await call('POST', '/nearby/codes', farmer.token)).body.code as string;
    await sql(`UPDATE nearby_codes SET expires_at = now() - interval '1 minute' WHERE code = $1`, [
      c,
    ]);
    expect(
      (await call('POST', '/nearby/claim', helper.token, { code: c, field: NEARBY_FIELD })).status,
    ).toBe(404);
  });

  it('kod tahmini sınırlanır: saatte 10 yanlış denemeden sonra 429', async () => {
    const guesser = await login('+905321110009');
    const real = (await call('POST', '/nearby/codes', farmer.token)).body.code as string;
    const wrong = real === '123456' ? '654321' : '123456';
    for (let i = 0; i < 10; i++) {
      expect(
        (await call('POST', '/nearby/claim', guesser.token, { code: wrong, field: NEARBY_FIELD }))
          .status,
      ).toBe(404);
    }
    // Doğru kod bile artık reddedilir
    expect(
      (await call('POST', '/nearby/claim', guesser.token, { code: real, field: NEARBY_FIELD }))
        .status,
    ).toBe(429);
  });

  it('giriş şart; kod biçimi doğrulanır', async () => {
    expect((await call('POST', '/nearby/codes')).status).toBe(401);
    expect(
      (await call('POST', '/nearby/claim', helper.token, { code: '12', field: NEARBY_FIELD }))
        .status,
    ).toBe(400);
  });
});
