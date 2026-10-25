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

/** G21: cihaz ekleme (sahiplik, künye), ölçümler, kind ayrımı, toprak/su parametreleri, tasarruf raporu. */
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
  ali = await login('+905321210001');
  veli = await login('+905321210002');
  expert = await login('+905321210003');
  await sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
    expert.userId,
    'expert',
  ]);
  await sql('UPDATE sessions SET mfa_at = now() WHERE user_id = $1', [expert.userId]);
  const f = await call('POST', '/fields', ali.token, {
    name: 'Zeytinlik',
    lat: 37.1,
    lon: 37.4,
    cropId: 'zeytin',
  });
  aliField = f.body.id;
  await sql(`UPDATE fields SET area_decare = 10 WHERE id = $1`, [aliField]);
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('cihaz ekle: sahiplik ve künye', () => {
  it('eski gövde ({fieldId, name}) sulama cihazı olarak çalışmaya devam eder', async () => {
    const r = await call('POST', '/devices', ali.token, { fieldId: aliField, name: 'Eski vana' });
    expect(r.status).toBe(201);
    expect(r.body.kind).toBe('sulama');
  });

  it('drone, üretici bulutu: künye saklanır (üretici, model, kaynak, adaptör sürümü), "örnek" işaretli', async () => {
    const r = await call('POST', '/devices', ali.token, {
      fieldId: aliField,
      name: 'Drone',
      kind: 'drone',
      method: 'uretici-bulutu',
      manufacturer: 'Örnek Üretici',
      model: 'X1',
      pairingCode: 'HESAP-123',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      kind: 'drone',
      manufacturer: 'Örnek Üretici',
      model: 'X1',
      connectionMethod: 'uretici-bulutu',
      source: 'ornek-bulut',
      adapterVersion: '1.0.0',
      sample: true,
    });
    const list = await call('GET', '/devices', ali.token);
    const d = list.body.find((x: any) => x.name === 'Drone');
    expect(d).toMatchObject({ manufacturer: 'Örnek Üretici', source: 'ornek-bulut' });
    expect(d.createdAt).toBeTruthy();
  });

  it('başkasının tarlasına cihaz eklenemez (403); olmayan tarlaya da (403)', async () => {
    const body = { name: 'Sızma', kind: 'nem-sensoru', method: 'csv-elle' };
    expect(
      (await call('POST', '/devices', veli.token, { ...body, fieldId: aliField })).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/devices', ali.token, {
          ...body,
          fieldId: '00000000-0000-4000-8000-000000000000',
        })
      ).status,
    ).toBe(403);
    const mine = await call('GET', '/devices', veli.token);
    expect(mine.body).toEqual([]);
  });

  it('tür-yöntem uyumsuzluğu ve kodsuz eşleştirme 400', async () => {
    const bad1 = await call('POST', '/devices', ali.token, {
      fieldId: aliField,
      name: 'X',
      kind: 'drone',
      method: 'eslestirme-kodu',
      pairingCode: 'ABC-123',
    });
    expect(bad1.status).toBe(400);
    const bad2 = await call('POST', '/devices', ali.token, {
      fieldId: aliField,
      name: 'Y',
      kind: 'sulama',
      method: 'eslestirme-kodu',
    });
    expect(bad2.status).toBe(400);
    const bad3 = await call('POST', '/devices', ali.token, {
      fieldId: aliField,
      name: 'Z',
      kind: 'uzay-gemisi',
      method: 'csv-elle',
    });
    expect(bad3.status).toBe(400);
  });

  it('giriş gerekir', async () => {
    expect((await call('POST', '/devices', undefined, {})).status).toBe(401);
  });
});

describe('sulama komutu kuralları cihaz kaydından sonra da geçerli', () => {
  let valve: string;
  let sensor: string;
  beforeAll(async () => {
    valve = (
      await call('POST', '/devices', ali.token, {
        fieldId: aliField,
        name: 'Vana',
        kind: 'sulama',
        method: 'eslestirme-kodu',
        pairingCode: 'VANA-0001',
      })
    ).body.id;
    sensor = (
      await call('POST', '/devices', ali.token, {
        fieldId: aliField,
        name: 'Nem sensörü',
        kind: 'nem-sensoru',
        method: 'csv-elle',
      })
    ).body.id;
  });

  it('nem sensörüne sulama komutu verilemez, sır üretilemez', async () => {
    const cmd = await call('POST', `/devices/${sensor}/commands`, ali.token, {
      action: 'open',
      minutes: 5,
      idempotencyKey: 'sensor-komut-1',
    });
    expect(cmd.status).toBe(403);
    expect((await call('POST', `/devices/${sensor}/provision`, ali.token)).status).toBe(403);
  });

  it('başkası başkasının vanasını açamaz (403)', async () => {
    const cmd = await call('POST', `/devices/${valve}/commands`, veli.token, {
      action: 'open',
      minutes: 5,
      idempotencyKey: 'veli-komut-1',
    });
    expect(cmd.status).toBe(403);
  });

  it('30 dakikadan uzun süre reddedilir', async () => {
    const cmd = await call('POST', `/devices/${valve}/commands`, ali.token, {
      action: 'open',
      minutes: 31,
      idempotencyKey: 'ali-komut-uzun',
    });
    expect(cmd.status).toBe(400);
  });
});

describe('cihaz ölçümleri', () => {
  let sensor: string;
  let valve: string;
  beforeAll(async () => {
    sensor = (
      await call('POST', '/devices', ali.token, {
        fieldId: aliField,
        name: 'Toprak nemi',
        kind: 'nem-sensoru',
        method: 'csv-elle',
      })
    ).body.id;
    valve = (await call('POST', '/devices', ali.token, { fieldId: aliField, name: 'V2' })).body.id;
  });
  const recent = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  it('CSV içe aktarılır; tekrar gönderilen satır çoğalmaz; aralık dışı ve bozuk satırlar reddedilir', async () => {
    const csv = `zaman,nem\n${recent(3)},%21\n${recent(2)},0.19\nbozuk,5\n${recent(1)},-4\n`;
    const r1 = await call('POST', `/devices/${sensor}/readings`, ali.token, { csv });
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ inserted: 2, duplicates: 0 });
    expect(r1.body.rejected).toBeGreaterThanOrEqual(2);
    const r2 = await call('POST', `/devices/${sensor}/readings`, ali.token, { csv });
    expect(r2.body).toMatchObject({ inserted: 0, duplicates: 2 });
  });

  it('seri okunur: nem m³/m³ olarak, zaman sıralı', async () => {
    const r = await call(
      'GET',
      `/devices/${sensor}/readings?metric=soil-moisture&hours=24`,
      ali.token,
    );
    expect(r.status).toBe(200);
    expect(r.body.readings.map((x: any) => x.value)).toEqual([0.21, 0.19]);
    expect(r.body.readings[0].unit).toBe('m3/m3');
    expect(r.body.source).toBe('csv-elle');
  });

  it('başkası ekleyemez ve okuyamaz (403)', async () => {
    expect(
      (
        await call('POST', `/devices/${sensor}/readings`, veli.token, {
          readings: [{ at: recent(1), metric: 'soil-moisture', value: 0.2 }],
        })
      ).status,
    ).toBe(403);
    expect((await call('GET', `/devices/${sensor}/readings`, veli.token)).status).toBe(403);
  });

  it('sulama cihazı ölçüm kabul etmez; geçersiz metrik ve süre 400', async () => {
    expect(
      (
        await call('POST', `/devices/${valve}/readings`, ali.token, {
          readings: [{ at: recent(1), metric: 'soil-moisture', value: 0.2 }],
        })
      ).status,
    ).toBe(400);
    expect((await call('GET', `/devices/${sensor}/readings?metric=sacma`, ali.token)).status).toBe(
      400,
    );
    expect((await call('GET', `/devices/${sensor}/readings?hours=99999`, ali.token)).status).toBe(
      400,
    );
  });

  it('veri cüzdanı dışa aktarması ölçümleri ve cihaz künyesini içerir', async () => {
    const r = await call('GET', '/me/export', ali.token);
    expect(r.body.deviceReadings.length).toBeGreaterThanOrEqual(2);
    expect(r.body.devices.some((d: any) => d.source === 'csv-elle')).toBe(true);
  });
});

describe('toprak ve bitki su parametreleri: onay kapısı', () => {
  it('toprak türleri veritabanından gelir, hepsi taslak', async () => {
    const r = await call('GET', '/soils', ali.token);
    // G23: FAO-56 Tablo 19'un 9 doku sınıfı, tarla kapasitesine göre sıralı.
    expect(r.body.map((s: any) => s.key)).toEqual([
      'kumlu',
      'tinli-kum',
      'kumlu-tin',
      'tinli',
      'siltli-tin',
      'silt',
      'siltli-killi-tin',
      'killi',
      'siltli-kil',
    ]);
    expect(r.body.every((s: any) => s.needsBadge)).toBe(true);
  });

  it('çiftçi onaylayamaz (403); uzman onaylar (MFA ile)', async () => {
    expect((await call('POST', '/soils/tinli/approve', ali.token)).status).toBe(403);
    expect((await call('POST', '/soils/tinli/approve', expert.token)).status).toBe(200);
    const r = await call('GET', '/soils', ali.token);
    expect(r.body.find((s: any) => s.key === 'tinli').needsBadge).toBe(false);
  });

  it('su parametresi: çiftçi giremez; uzman kaynakla girer (taslak), sonra onaylar', async () => {
    const body = {
      rootDepthM: 1.2,
      pTable: 0.65,
      source: 'Test kaynağı (FAO-56 Tablo 22 yerine geçmez)',
      sourceVersion: 't1',
      sourceDate: '2026-10-01',
    };
    expect((await call('PUT', '/crops/zeytin/water-params', ali.token, body)).status).toBe(403);
    expect((await call('PUT', '/crops/zeytin/water-params', expert.token, body)).status).toBe(200);
    const list = await call('GET', '/crop-water-params', ali.token);
    expect(list.body[0]).toMatchObject({ cropId: 'zeytin', rootDepthM: 1.2, needsBadge: true });
    expect((await call('POST', '/crops/zeytin/water-params/approve', expert.token)).status).toBe(
      200,
    );
    const after = await call('GET', '/crop-water-params', ali.token);
    expect(after.body[0].needsBadge).toBe(false);
  });

  it('kaynaksız ya da geçersiz değer reddedilir', async () => {
    const r = await call('PUT', '/crops/zeytin/water-params', expert.token, {
      rootDepthM: -1,
      pTable: 2,
      source: '',
      sourceVersion: '',
      sourceDate: 'dün',
    });
    expect(r.status).toBe(400);
  });
});

describe('tasarruf raporu', () => {
  const url = (extra = '') => `/fields/${aliField}/savings?days=30${extra}`;

  it('Kc onaysızken rapor yok (kural 1): uzman-onayi-bekliyor', async () => {
    const r = await call('GET', url(), ali.token);
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({ kind: 'none', reason: 'uzman-onayi-bekliyor' });
    expect(r.body.result.missing).toContain('Kc');
  });

  it('başkası raporu göremez (403); giriş gerekir', async () => {
    expect((await call('GET', url(), veli.token)).status).toBe(403);
    expect((await call('GET', url())).status).toBe(401);
  });

  it('girdiler onaylanınca rapor çıkar: etiketler, kaynaklar, varsayımlar', async () => {
    await sql(
      `UPDATE crop_pack_versions SET review_status = 'uzman-onayli' WHERE crop_id = 'zeytin'`,
    );
    const r = await call('GET', url(), ali.token);
    expect(r.status).toBe(200);
    const res = r.body.result;
    expect(res.kind).toBe('report');
    expect(res.days).toBe(30);
    expect(res.areaDecare).toBe(10);
    expect(res.savedM3).toBeCloseTo(res.traditionalM3 - res.pusulaM3, 6);
    // beyan yok: varsayım + hesap ⇒ tahmin
    expect(res.traditionalBasis).toBe('varsayim');
    expect(res.isEstimate).toBe(true);
    expect(res.assumptions.join(' ')).toContain('kaynaksız varsayım');
    expect(r.body.sources.weather.name).toContain('örnek');
    expect(r.body.sources.kc.version).toContain('paket v');
    expect(r.body.sources.soil.name).toContain('FAO-56');
    expect(r.body.sources.waterParams.name).toContain('Test kaynağı');
    expect(r.body.method).toContain('FAO-56');
  });

  it('çiftçi beyanı verilirse "beyan"; sayaç ölçümü verilirse "olculen"', async () => {
    const r = await call('GET', url('&intervalDays=5&depthMm=30'), ali.token);
    expect(r.body.result.traditionalBasis).toBe('beyan');
    const m = await call(
      'GET',
      url('&intervalDays=5&depthMm=30&meteredPusulaM3=100&meteredTraditionalM3=400'),
      ali.token,
    );
    expect(m.body.result).toMatchObject({
      pusulaBasis: 'olculen',
      traditionalBasis: 'olculen',
      isEstimate: false,
      pusulaM3: 100,
      traditionalM3: 400,
      savedM3: 300,
      savedPct: 75,
    });
  });

  it('seçilen toprak onaysızsa (kumlu) rapor yok; geçersiz parametre 400', async () => {
    const r = await call('GET', url('&soil=kumlu'), ali.token);
    expect(r.body.result).toMatchObject({ kind: 'none', reason: 'uzman-onayi-bekliyor' });
    expect(r.body.result.missing).toContain('toprak');
    expect((await call('GET', `/fields/${aliField}/savings?days=3`, ali.token)).status).toBe(400);
  });
});

describe('sulama hatırlatıcıları (G20.2)', () => {
  const url = (extra = '') => `/fields/${aliField}/reminders?x=1${extra}`;
  let sensor: string;
  beforeAll(async () => {
    sensor = (
      await call('POST', '/devices', ali.token, {
        fieldId: aliField,
        name: 'Hatırlatıcı sensörü',
        kind: 'nem-sensoru',
        method: 'csv-elle',
      })
    ).body.id;
  });

  it('giriş gerekir; başkası göremez (403)', async () => {
    expect((await call('GET', url())).status).toBe(401);
    expect((await call('GET', url(), veli.token)).status).toBe(403);
  });

  it('onaysız toprak: iki hatırlatıcı da "onaysiz-veri" (kural 1)', async () => {
    const r = await call('GET', url('&soil=kumlu'), ali.token);
    expect(r.status).toBe(200);
    expect(r.body.daily).toEqual({ kind: 'none', reason: 'onaysiz-veri' });
    expect(r.body.moisture).toEqual({ kind: 'none', reason: 'onaysiz-veri' });
  });

  it('onaylı girdilerle: en son taze ölçüm (0,19) eşiğin üstünde; günlük ihtiyaç tahmin etiketli', async () => {
    const r = await call('GET', url(), ali.token);
    expect(r.body.hasSensor).toBe(true);
    // Önceki testte yüklenen 0,19 m³/m³ ölçüm 2 saat önce; kritik eşik ~0,146.
    expect(r.body.moisture).toEqual({ kind: 'none', reason: 'esik-ustunde' });
    expect(r.body.daily.kind).toBe('none'); // 14 günlük sahte hava: eksik su RAW altında
    expect(r.body.basis.dailyIsEstimate).toBe(true);
    expect(r.body.basis.note).toContain('tahmin');
    expect(r.body.basis.sources.soil.name).toContain('FAO-56');
  });

  it('taze ölçüm kritik eşiğin altındaysa nem hatırlatıcısı gelir; eşik üstündeyse gelmez', async () => {
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    await call('POST', `/devices/${sensor}/readings`, ali.token, {
      readings: [{ at: recent, metric: 'soil-moisture', value: 0.12 }],
    });
    const r = await call('GET', url(), ali.token);
    expect(r.body.moisture.kind).toBe('due');
    expect(r.body.moisture.type).toBe('nem-esigi');
    expect(r.body.moisture.body).toContain('%12');
    // kullanıcı eşiği 0,10: 0,12 eşiğin üstünde ⇒ hatırlatıcı yok
    const r2 = await call('GET', url('&moistureThreshold=0.1'), ali.token);
    expect(r2.body.moisture).toEqual({ kind: 'none', reason: 'esik-ustunde' });
    // kapalıysa yok
    const r3 = await call('GET', url('&moistureEnabled=0'), ali.token);
    expect(r3.body.moisture).toEqual({ kind: 'none', reason: 'kapali' });
  });

  it('geçersiz sorgu 400', async () => {
    expect((await call('GET', url('&dailyHour=30'), ali.token)).status).toBe(400);
  });
});
