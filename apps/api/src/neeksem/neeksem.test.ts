/* eslint-disable @typescript-eslint/no-explicit-any -- testlerde yanıt gövdesi serbest biçimli */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { FakeSmsProvider } from '../auth/sms';
import { importCropCatalog } from '../crops';
import { migrate, systemTx } from '../db/db';
import { createTestDb } from '../db/testdb';
import { Places } from '../places';
import { NeEksemData } from './data';
import { seasonOf } from './neeksem.controller';

/** Ne Eksem: sıralama, kaynaklar, bilgi kipi, niyet beyanı ve bölge toplamı, yetki, dışa aktarım. */
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

let ali: Awaited<ReturnType<typeof login>>;
let veli: Awaited<ReturnType<typeof login>>;
let nizip: string;
let bilinmeyen: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      places: Places.load(),
      neEksem: NeEksemData.load(),
      now: () => new Date('2026-11-15T09:00:00Z'),
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login('+905321230001');
  veli = await login('+905321230002');
  const r = await call('POST', '/fields', ali.token, {
    name: 'Nizip tarlası',
    province: 'Gaziantep',
    district: 'Nizip',
    lat: 37.0,
    lon: 37.8,
    cropId: 'antep-fistigi',
    areaDecare: 20,
  });
  expect(r.status).toBe(201);
  nizip = r.body.id;
  const r2 = await call('POST', '/fields', veli.token, {
    name: 'Konumsuz',
    lat: 39.0,
    lon: 32.0,
    areaDecare: 10,
  });
  bilinmeyen = r2.body.id;
  // Konumdan il türetilir; "ili bilinmeyen tarla" durumunu sınamak için il ve ilçe silinir.
  await systemTx(db, (q) =>
    q.query('UPDATE fields SET province = NULL, district = NULL WHERE id = $1', [bilinmeyen]),
  );
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db.close();
});

describe('veri dosyaları', () => {
  it('üç CSV yüklenir; Nizip deseni ve kaynaklar dolu', () => {
    const d = NeEksemData.load();
    expect(d.balance.get('aycicegi')!.yeterlilikPct).toBe(63.2);
    expect(d.balance.get('aycicegi')!.source).toContain('TÜİK');
    expect(d.plan.length).toBeGreaterThan(800);
    const p = d.planFor('Gaziantep', 'Nizip');
    expect(p.district!.crops).toContain('pamuk');
    expect(p.district!.crops).toContain('mercimek');
    expect(p.provinceRows).toBeGreaterThan(5);
    expect(d.planFor('gaziantep', 'NİZİP').district).not.toBeNull();
    expect(d.planFor(null, null).district).toBeNull();
    expect(d.restrictions.get('findik')!.reviewStatus).toBe('taslak-uzman-onayi-bekliyor');
  });
  it('sezon: ağustos ve sonrası bir sonraki yıl', () => {
    expect(seasonOf('2026-11-15')).toBe('2027');
    expect(seasonOf('2026-03-01')).toBe('2026');
  });
});

describe('GET /fields/:id/ne-eksem', () => {
  it('Nizip: açık + resmî plan sıralar; ilk sırada ayçiçeği/mısır gibi açık ürünleri; bilgi kipi; kaynaklar', async () => {
    const r = await call('GET', `/fields/${nizip}/ne-eksem`, ali.token);
    expect(r.status).toBe(200);
    const t = r.body;
    expect(t.province).toBe('Gaziantep');
    expect(t.district).toBe('Nizip');
    expect(t.season).toBe('2027');
    expect(t.mode).toBe('bilgi');
    expect(t.badge).toBe(true);
    expect(t.confidence).toBe('temel');
    expect(t.plan.district).toBe(true);
    const ids = t.ranked.map((x: any) => x.cropId);
    expect(ids.length).toBeLessThanOrEqual(10);
    // Ayçiçeği (%63,2; Nizip planında) en önde; nohut (fazla) ondan sonra.
    expect(ids[0]).toBe('aycicegi');
    if (ids.includes('nohut')) expect(ids.indexOf('aycicegi')).toBeLessThan(ids.indexOf('nohut'));
    const ay = t.ranked[0];
    expect(ay.inDistrictPlan).toBe(true);
    expect(ay.band).toBe('acik-buyuk');
    expect(ay.bandLabel).toBe('Açık büyük');
    expect(ay.bar).toBeGreaterThan(0.9);
    expect(ay.reasons.join(' ')).toContain('havza ürün deseni');
    expect(ay.intents).toEqual({ decare: 0, count: 0 });
    expect(ay.remainingQuota).toBeNull();
    // Kısıtlı bahçe ürünleri ayrı listede; verisizler ayrı.
    expect(t.restricted.map((x: any) => x.cropId)).toContain('findik');
    expect(ids).not.toContain('findik');
    expect(t.noData.map((x: any) => x.cropId)).toContain('zeytin');
    expect(t.sources.balance.join(' ')).toContain('TÜİK');
    expect(t.sources.plan).toContain('8859');
    expect(t.assumptions.join(' ')).toContain('bilgi amaçlı');
    expect(JSON.stringify(t)).not.toMatch(/\bekin\b|\bekmelisin/);
  });

  it('ili olmayan tarla: plan boş, sıralama yine üretilir (yalnız TÜİK)', async () => {
    const r = await call('GET', `/fields/${bilinmeyen}/ne-eksem`, veli.token);
    expect(r.status).toBe(200);
    expect(r.body.plan.district).toBe(false);
    expect(r.body.plan.provinceRows).toBe(0);
    expect(r.body.ranked.length).toBeGreaterThan(3);
    expect(r.body.ranked.every((x: any) => !x.inDistrictPlan && !x.inProvincePlan)).toBe(true);
  });

  it('başkasının tarlası 403', async () => {
    const r = await call('GET', `/fields/${nizip}/ne-eksem`, veli.token);
    expect(r.status).toBe(403);
  });
});

describe('niyet beyanı', () => {
  it('beyan eklenir, aynı ürün tekrar beyanda güncellenir, bölge toplamına kişisiz girer, silinir', async () => {
    const a = await call('POST', `/fields/${nizip}/ne-eksem/niyet`, ali.token, {
      cropId: 'aycicegi',
      dekar: 8,
    });
    expect(a.status).toBe(201);
    expect(a.body.season).toBe('2027');
    const b = await call('POST', `/fields/${nizip}/ne-eksem/niyet`, ali.token, {
      cropId: 'aycicegi',
      dekar: 12,
    });
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);

    // Veli de Gaziantep'te beyan verir: Ali'nin ekranında yalnız toplam görünür, kimlik görünmez.
    const vf = await call('POST', '/fields', veli.token, {
      name: 'Veli Gaziantep',
      province: 'Gaziantep',
      district: 'Şehitkamil',
      lat: 37.1,
      lon: 37.3,
      areaDecare: 30,
    });
    const v = await call('POST', `/fields/${vf.body.id}/ne-eksem/niyet`, veli.token, {
      cropId: 'aycicegi',
      dekar: 20,
    });
    expect(v.status).toBe(201);

    const t = await call('GET', `/fields/${nizip}/ne-eksem`, ali.token);
    const ay = t.body.ranked.find((x: any) => x.cropId === 'aycicegi');
    expect(ay.intents).toEqual({ decare: 32, count: 2 });
    expect(ay.mine).toBe(12);
    expect(t.body.myIntents).toEqual([
      { id: a.body.id, cropId: 'aycicegi', name: 'Ayçiçeği', dekar: 12 },
    ]);
    expect(JSON.stringify(t.body)).not.toContain('Veli');

    const d = await call('DELETE', `/fields/${nizip}/ne-eksem/niyet/${a.body.id}`, ali.token);
    expect(d.status).toBe(204);
    const t2 = await call('GET', `/fields/${nizip}/ne-eksem`, ali.token);
    expect(t2.body.myIntents).toEqual([]);
    expect(t2.body.ranked.find((x: any) => x.cropId === 'aycicegi').intents.decare).toBe(20);
  });

  it('tarla alanından büyük beyan, bilinmeyen ürün ve başkasının tarlası reddedilir', async () => {
    const big = await call('POST', `/fields/${nizip}/ne-eksem/niyet`, ali.token, {
      cropId: 'arpa',
      dekar: 25,
    });
    expect(big.status).toBe(400);
    const bad = await call('POST', `/fields/${nizip}/ne-eksem/niyet`, ali.token, {
      cropId: 'yok-boyle-urun',
      dekar: 1,
    });
    expect(bad.status).toBe(400);
    const other = await call('POST', `/fields/${nizip}/ne-eksem/niyet`, veli.token, {
      cropId: 'arpa',
      dekar: 1,
    });
    expect(other.status).toBe(403);
  });

  it('dışa aktarımda beyanlar çıkar (KVKK taşınabilirlik)', async () => {
    await call('POST', `/fields/${nizip}/ne-eksem/niyet`, ali.token, { cropId: 'arpa', dekar: 3 });
    const r = await call('GET', '/me/export', ali.token);
    expect(r.status).toBe(200);
    expect(r.body.ekimNiyetleri).toEqual([
      expect.objectContaining({ fieldId: nizip, cropId: 'arpa', dekar: 3, season: '2027' }),
    ]);
  });
});
