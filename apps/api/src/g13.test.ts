/* eslint-disable @typescript-eslint/no-explicit-any -- testlerde yanıt gövdesi serbest biçimli */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Boundary } from '@tarim/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { migrate, PgliteDb } from './db/db';
import {
  AGGREGATION,
  CopernicusNdviClient,
  FakeNdviProvider,
  NdviUnavailableError,
  sampleNdvi,
} from './ndvi/provider';
import { Places } from './places';

const recorded = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'ndvi', 'fixtures', 'statistical_response.json'),
    'utf8',
  ),
);

const square: Boundary = {
  type: 'Polygon',
  coordinates: [
    [
      [37.4, 37.1],
      [37.402, 37.1],
      [37.402, 37.102],
      [37.4, 37.102],
      [37.4, 37.1],
    ],
  ],
};

interface Seen {
  url: string;
  init: RequestInit;
}

function fakeCopernicus(
  opts: { tokenStatus?: number; apiStatus?: number; expiresIn?: number } = {},
) {
  const seen: Seen[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    if (url.includes('openid-connect/token')) {
      return new Response(
        JSON.stringify({ access_token: 'tok-' + seen.length, expires_in: opts.expiresIn ?? 600 }),
        { status: opts.tokenStatus ?? 200 },
      );
    }
    return new Response(JSON.stringify(recorded), { status: opts.apiStatus ?? 200 });
  }) as unknown as typeof fetch;
  return { seen, impl };
}

describe('Copernicus istemcisi (kayıtlı biçimdeki yanıtla)', () => {
  it('jeton alır, doğru gövdeyle sorar, yanıtı ayrıştırır', async () => {
    const f = fakeCopernicus();
    const c = new CopernicusNdviClient({
      clientId: 'id',
      clientSecret: 'sir',
      fetchImpl: f.impl,
      now: () => Date.parse('2026-10-20T09:00:00Z'),
    });
    const r = await c.series(square, '2026-05-23', '2026-10-20');
    expect(f.seen).toHaveLength(2);
    expect(f.seen[0]!.init.body).toContain('grant_type=client_credentials');
    expect(f.seen[0]!.init.body).toContain('client_id=id');
    const headers = f.seen[1]!.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer tok-1');
    const body = JSON.parse(f.seen[1]!.init.body as string);
    expect(body.input.bounds.geometry).toEqual(square);
    expect(body.input.data[0].type).toBe('sentinel-2-l2a');
    expect(body.aggregation.aggregationInterval.of).toBe(AGGREGATION);
    expect(body.aggregation.timeRange).toEqual({
      from: '2026-05-23T00:00:00Z',
      to: '2026-10-20T00:00:00Z',
    });
    expect(body.aggregation.evalscript).toContain('B08');
    // Kayıtlı yanıt: 6 aralık, biri tamamen veri-yok (atılır) -> 5 nokta.
    expect(r.points.map((p) => p.mean)).toEqual([0.64, 0.66, 0.62, 0.63, 0.41]);
    expect(r.points[2]!.validFraction).toBeCloseTo(0.25, 12);
    expect(r).toMatchObject({ sample: false, version: 'statistical-v1@2026-10-20' });
    expect(r.source).toContain('Copernicus');
  });

  it('jetonu süresi dolana kadar yeniden kullanır, sonra yeniler', async () => {
    const f = fakeCopernicus({ expiresIn: 100 });
    let now = 0;
    const c = new CopernicusNdviClient({
      clientId: 'a',
      clientSecret: 'b',
      fetchImpl: f.impl,
      now: () => now,
    });
    await c.series(square, '2026-05-01', '2026-06-01');
    await c.series(square, '2026-05-01', '2026-06-01');
    expect(f.seen.filter((s) => s.url.includes('token'))).toHaveLength(1);
    now = 80_000; // 100 sn - 30 sn payı = 70 sn sonra yenilenir
    await c.series(square, '2026-05-01', '2026-06-01');
    expect(f.seen.filter((s) => s.url.includes('token'))).toHaveLength(2);
  });

  it('kimlik reddi, API hatası ve ağ hatası NdviUnavailableError olur', async () => {
    const mk = (f: ReturnType<typeof fakeCopernicus>) =>
      new CopernicusNdviClient({ clientId: 'a', clientSecret: 'b', fetchImpl: f.impl });
    await expect(mk(fakeCopernicus({ tokenStatus: 401 })).series(square, 'a', 'b')).rejects.toThrow(
      NdviUnavailableError,
    );
    await expect(mk(fakeCopernicus({ apiStatus: 429 })).series(square, 'a', 'b')).rejects.toThrow(
      /429/,
    );
    const down = new CopernicusNdviClient({
      clientId: 'a',
      clientSecret: 'b',
      fetchImpl: (async () => {
        throw new TypeError('network');
      }) as unknown as typeof fetch,
    });
    await expect(down.series(square, 'a', 'b')).rejects.toThrow(/ulaşılamadı/);
  });
});

describe('örnek seri', () => {
  it('belirlenimli, aralıklar bitişik, bazıları bulutlu', () => {
    const a = sampleNdvi('2026-05-23', '2026-10-20');
    expect(a).toEqual(sampleNdvi('2026-05-23', '2026-10-20'));
    expect(a.length).toBe(21);
    expect(a.some((p) => p.validFraction < 0.5)).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i]!.from).toBe(a[i - 1]!.to);
  });
});

// ---------------------------------------------------------------------------------------------

const db = new PgliteDb();
const sms = new FakeSmsProvider();
let app: INestApplication;
let base: string;
const NOW = new Date('2026-10-20T09:00:00Z');
let clock = NOW.getTime();
const provider = new FakeNdviProvider();
let failing = false;
const flaky = {
  series: (...a: Parameters<FakeNdviProvider['series']>) => {
    if (failing) throw new NdviUnavailableError('kesinti');
    return provider.series(...a);
  },
};

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
let withBoundary: string;
let noBoundary: string;

beforeAll(async () => {
  await migrate(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      places: Places.load(),
      now: () => new Date(clock),
      ndvi: flaky,
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  ali = await login('+905321300001');
  veli = await login('+905321300002');
  withBoundary = (
    await call('POST', '/fields', ali.token, {
      name: 'Sınırlı',
      lat: 37.101,
      lon: 37.401,
      boundary: square,
    })
  ).body.id;
  noBoundary = (
    await call('POST', '/fields', ali.token, { name: 'Sınırsız', lat: 37.2, lon: 37.5 })
  ).body.id;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('GET /fields/:id/ndvi', () => {
  it('giriş şart; başkasının tarlası 403', async () => {
    expect((await call('GET', `/fields/${withBoundary}/ndvi`)).status).toBe(401);
    expect((await call('GET', `/fields/${withBoundary}/ndvi`, veli.token)).status).toBe(403);
  });

  it('sınır yoksa uydurma kare üretilmez, sebep döner', async () => {
    const r = await call('GET', `/fields/${noBoundary}/ndvi`, ali.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ kind: 'none', reason: 'sinir-yok', fieldId: noBoundary });
  });

  it('seri: bulutlu aralık gösterilmez, kaynak+tarih+sürüm, örnek işareti, rozet', async () => {
    const r = await call('GET', `/fields/${withBoundary}/ndvi`, ali.token);
    expect(r.status).toBe(200);
    const b = r.body;
    expect(b.kind).toBe('series');
    expect(b.sample).toBe(true);
    expect(b.needsBadge).toBe(true);
    expect(b.points.length + b.skipped).toBe(21);
    expect(b.skipped).toBeGreaterThan(0);
    expect(b.points.every((p: any) => p.validFraction >= 0.5)).toBe(true);
    expect(b.source).toMatchObject({ version: 'ornek-v1', date: '2026-10-20' });
    expect(b.source.name).toContain('gerçek uydu verisi değil');
    expect(b.trend.kind).toBeDefined();
    expect(b.stale).toBe(false);
  });

  it('12 saat içinde sağlayıcıya yeniden gitmez', async () => {
    const before = provider.calls;
    await call('GET', `/fields/${withBoundary}/ndvi`, ali.token);
    expect(provider.calls).toBe(before);
  });

  it('uydu kesintisinde önbellekteki seri "eski" işaretiyle döner; önbellek yoksa 503', async () => {
    clock = NOW.getTime() + 13 * 3_600_000; // önbellek süresi doldu
    failing = true;
    const r = await call('GET', `/fields/${withBoundary}/ndvi`, ali.token);
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect(r.body.fetchedAt).toBe(NOW.toISOString());
    // Önbelleği olmayan ikinci tarla.
    const f2 = (
      await call('POST', '/fields', ali.token, {
        name: 'Yeni',
        lat: 37.3,
        lon: 37.3,
        boundary: square,
      })
    ).body.id;
    expect((await call('GET', `/fields/${f2}/ndvi`, ali.token)).status).toBe(503);
    failing = false;
    clock = NOW.getTime();
  });

  it('düşüş kuralı sunucuda: son güvenilir değer önceki medyanın 0,15 altındaysa "drop"', async () => {
    const drop = new FakeNdviProvider((from) => [
      ...[0.7, 0.72, 0.68].map((m, i) => ({
        from: `2026-09-0${i + 1}`,
        to: `2026-09-0${i + 2}`,
        mean: m,
        min: 0,
        max: 1,
        stDev: 0,
        validFraction: 1,
      })),
      { from, to: from, mean: 0.45, min: 0, max: 1, stDev: 0, validFraction: 1 },
    ]);
    const r = await drop.series(square, '2026-10-01', '2026-10-20');
    const { assessNdviTrend } = await import('@tarim/agro-core');
    const t = assessNdviTrend(r.points);
    expect(t.kind).toBe('drop');
  });
});
