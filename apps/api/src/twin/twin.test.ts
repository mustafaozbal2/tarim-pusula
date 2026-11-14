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
import { FakeWeatherProvider, parseTwin } from '../weather/openmeteo';

/** İkiz Tarım: durum, senaryolar, kayıt, kip kapısı, yetki ve karne kaydı. Hava sahte (ağsız). */
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
let field: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      places: Places.load(),
      weather: new FakeWeatherProvider(),
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login('+905321230001');
  veli = await login('+905321230002');
  const r = await call('POST', '/fields', ali.token, {
    name: 'Yayla zeytinliği',
    lat: 37.1,
    lon: 37.4,
    cropId: 'zeytin',
    areaDecare: 12,
  });
  expect(r.status).toBe(201);
  field = r.body.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db.close();
});

describe('GET /fields/:id/twin', () => {
  it('onaysız girdilerle "bilgi" kipi: durum, 4 senaryo, aralıklar, kaynaklar; öneri yok', async () => {
    const r = await call('GET', `/fields/${field}/twin`, ali.token);
    expect(r.status).toBe(200);
    const t = r.body;
    expect(t.mode).toBe('bilgi');
    expect(t.badge).toBe(true);
    expect(t.unapproved).toContain('toprak');
    expect(t.state.days.length).toBeGreaterThan(30);
    expect(t.state.end.taw).toBeGreaterThan(0);
    expect(t.scenarios.map((s: any) => s.plan.kind)).toEqual([
      'kural',
      'bekle',
      'kisintili',
      'yok',
    ]);
    const yok = t.scenarios.find((s: any) => s.plan.kind === 'yok');
    expect(yok.days.length).toBe(16);
    expect(yok.members).toBe(5);
    expect(yok.days[0].dr.p10).toBeLessThanOrEqual(yok.days[0].dr.p90);
    expect(yok.waterMm.p50).toBe(0);
    // Zeytin: FAO-66 eğrisi; kaynak yazılı.
    expect(yok.yieldLoss.model.kind).toBe('egri');
    expect(t.sources.yield).toContain('FAO');
    expect(t.sources.waterParams).toContain('FAO-56 Tablo 22');
    expect(t.params.pTable).toBe(0.65);
    expect(t.gdd.baseC).toBe(7);
    expect(t.gdd.sum).toBeGreaterThan(0);
    expect(t.weather.sample).toBe(true);
    expect(t.assumptions.join(' ')).toContain('bilgi amaçlı');
  });

  it('çiftçinin alışkanlığı verilirse "aralik" senaryosu eklenir', async () => {
    const r = await call('GET', `/fields/${field}/twin?intervalDays=4&depthMm=30`, ali.token);
    const kinds = r.body.scenarios.map((s: any) => s.plan.kind);
    expect(kinds).toContain('aralik');
    const a = r.body.scenarios.find((s: any) => s.plan.kind === 'aralik');
    expect(a.irrigations).toBe(4);
    expect(a.waterMm.p50).toBe(120);
  });

  it('sulama kaydı duruma girer; başkası kayıt ekleyemez ve ikizi göremez', async () => {
    const before = await call('GET', `/fields/${field}/twin`, ali.token);
    const todayDr = before.body.state.end.dr;
    const yesterday = before.body.state.end.date;
    const add = await call('POST', `/fields/${field}/twin/events`, ali.token, {
      onDate: yesterday,
      kind: 'sulama',
      mm: 40,
      note: 'damla, 3 saat',
    });
    expect(add.status).toBe(201);
    const after = await call('GET', `/fields/${field}/twin`, ali.token);
    expect(after.body.events).toHaveLength(1);
    expect(after.body.events[0].mm).toBe(40);
    expect(after.body.state.end.dr).toBeLessThan(todayDr);

    const other = await call('POST', `/fields/${field}/twin/events`, veli.token, {
      onDate: yesterday,
      kind: 'sulama',
      mm: 10,
    });
    expect(other.status).toBe(403);
    expect((await call('GET', `/fields/${field}/twin`, veli.token)).status).toBe(403);

    const del = await call('DELETE', `/fields/${field}/twin/events/${add.body.id}`, ali.token);
    expect(del.status).toBe(204);
    expect((await call('GET', `/fields/${field}/twin`, ali.token)).body.events).toHaveLength(0);
  });

  it('hepsi onaylanınca "öneri" kipi ve kuralın ilk sulama günü', async () => {
    await systemTx(db, async (q) => {
      await q.query(`UPDATE soil_types SET review_status = 'uzman-onayli' WHERE key = 'tinli'`);
      await q.query(
        `UPDATE crop_pack_versions SET review_status = 'uzman-onayli' WHERE crop_id = 'zeytin'`,
      );
      await q.query(
        `INSERT INTO crop_water_params(crop_id, root_depth_m, p_table, review_status, source, source_version, source_date)
         VALUES ('zeytin', 1.45, 0.65, 'uzman-onayli', 'test', 'v1', '2026-01-01') ON CONFLICT (crop_id) DO NOTHING`,
      );
    });
    const r = await call('GET', `/fields/${field}/twin`, ali.token);
    expect(r.body.mode).toBe('oneri');
    expect(r.body.badge).toBe(false);
    expect(r.body.unapproved).toEqual([]);
    const kural = r.body.scenarios.find((s: any) => s.plan.kind === 'kural');
    expect(kural).toBeDefined();
  });

  it('geçersiz kayıt reddedilir', async () => {
    const r = await call('POST', `/fields/${field}/twin/events`, ali.token, {
      onDate: 'dün',
      kind: 'sulama',
      mm: 5,
    });
    expect(r.status).toBe(400);
  });
});

describe('parseTwin', () => {
  it('topluluk üyelerini ve arşivi ayrıştırır; eksik üye atlanır', () => {
    const forecast = {
      elevation: 800,
      utc_offset_seconds: 10800,
      daily: {
        time: ['2026-07-01', '2026-07-02'],
        temperature_2m_min: [10, 11],
        temperature_2m_max: [30, 31],
        precipitation_sum: [0, 2],
      },
    };
    const ens = {
      daily: {
        time: ['2026-07-02'],
        precipitation_sum_member01: [1],
        precipitation_sum_member02: [3],
        et0_fao_evapotranspiration_member01: [4],
        et0_fao_evapotranspiration_member02: [null],
      },
    };
    const archive = {
      daily: { time: ['2026-02-01'], temperature_2m_min: [1], temperature_2m_max: [9] },
    };
    const t = parseTwin(forecast, ens, archive, 'icon', '2026-07-01T00:00:00Z');
    expect(t.days).toHaveLength(2);
    expect(t.members).toEqual([{ date: '2026-07-02', et0: [4], rainMm: [1] }]);
    expect(t.season).toEqual([{ date: '2026-02-01', tMinC: 1, tMaxC: 9 }]);
    expect(t.sample).toBe(false);
  });
});
