import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FakePushClient, InMemoryQueue } from '@tarim/workers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotifyService } from './notify';
import { AppModule } from '../app.module';
import { FakeSmsProvider } from '../auth/sms';
import { importCropCatalog } from '../crops';
import { migrate, PgliteDb, systemTx } from '../db/db';
import {
  FakeWeatherProvider,
  OpenMeteoClient,
  type WeatherBundle,
  type WeatherProvider,
  WeatherUnavailableError,
  parseBundle,
  sampleBundle,
} from './openmeteo';

// ---------------------------------------------------------------------------
// Open-Meteo istemcisi (ağ yok: fetch taklit edilir)
// ---------------------------------------------------------------------------
const FORECAST = {
  latitude: 37.08,
  longitude: 37.37,
  utc_offset_seconds: 10800,
  elevation: 842,
  current: { time: '2026-10-20T04:00', temperature_2m: 10.6, weather_code: 0 },
  daily: {
    time: ['2026-10-20', '2026-10-21'],
    temperature_2m_max: [21.3, 19.5],
    temperature_2m_min: [9.8, 12.1],
    shortwave_radiation_sum: [15.08, 10.34],
    relative_humidity_2m_mean: [62, 64],
    wind_speed_10m_mean: [1.38, 1.54],
    precipitation_sum: [0, 0.4],
    et0_fao_evapotranspiration: [2.73, 2.1],
  },
};
const ENSEMBLE = {
  elevation: 842,
  daily: {
    time: ['2026-10-20', '2026-10-21'],
    temperature_2m_min: [9, 11],
    temperature_2m_min_member01: [8, 10],
    temperature_2m_min_member02: [10, null],
  },
};

function mockFetch(opts: { failEnsemble?: boolean; failAll?: boolean } = {}) {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    if (opts.failAll) throw new Error('ağ yok');
    if (url.includes('ensemble-api')) {
      if (opts.failEnsemble) return new Response('hata', { status: 500 });
      return new Response(JSON.stringify(ENSEMBLE));
    }
    return new Response(JSON.stringify(FORECAST));
  }) as unknown as typeof fetch;
  return { impl, urls };
}

describe('OpenMeteoClient', () => {
  it('yanıtı çözer; kaynak + çekilme tarihi damgası taşır', async () => {
    const m = mockFetch();
    const c = new OpenMeteoClient({
      fetchImpl: m.impl,
      now: () => Date.parse('2026-10-20T01:00:00Z'),
    });
    const b = await c.get(37.06, 37.38);
    expect(b.source).toContain('Open-Meteo');
    expect(b.fetchedAt).toBe('2026-10-20T01:00:00.000Z');
    expect(b.stale).toBe(false);
    expect(b.elevationM).toBe(842);
    expect(b.days).toHaveLength(2);
    expect(b.days[0]).toMatchObject({ tMinC: 9.8, tMaxC: 21.3, shortwaveMjM2: 15.08 });
    expect(b.current).toMatchObject({ tempC: 10.6, weatherCode: 0 });
    // Üyeler: kontrol + 2; null değerler atılır.
    expect(b.ensemble!.days[0]!.minC).toEqual([9, 8, 10]);
    expect(b.ensemble!.days[1]!.minC).toEqual([11, 10]);
    expect(m.urls.some((u) => u.includes('wind_speed_unit=ms'))).toBe(true);
  });

  it('yakın konumlar önbelleği paylaşır; süre dolunca yeniden çeker', async () => {
    const m = mockFetch();
    let t = 0;
    const c = new OpenMeteoClient({ fetchImpl: m.impl, now: () => t, ttlMs: 1000 });
    await c.get(37.06, 37.38);
    await c.get(37.07, 37.39); // aynı ~5 km hücre
    expect(m.urls).toHaveLength(2); // forecast + ensemble, bir kez
    t = 2000;
    await c.get(37.06, 37.38);
    expect(m.urls).toHaveLength(4);
  });

  it('ağ kesilince önbellekteki eski veriyi "stale" olarak verir', async () => {
    let fail = false;
    const ok = mockFetch();
    const impl = (async (u: string) => {
      if (fail) throw new Error('ağ yok');
      return ok.impl(u);
    }) as unknown as typeof fetch;
    let t = 0;
    const c = new OpenMeteoClient({ fetchImpl: impl, now: () => t, ttlMs: 1000 });
    await c.get(37.06, 37.38);
    fail = true;
    t = 5000;
    const b = await c.get(37.06, 37.38);
    expect(b.stale).toBe(true);
    expect(b.fetchedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('ensemble hatası ölümcül değil; tahmin hatası önbellek yoksa WeatherUnavailableError', async () => {
    const c1 = new OpenMeteoClient({ fetchImpl: mockFetch({ failEnsemble: true }).impl });
    const b = await c1.get(37, 37);
    expect(b.ensemble).toBeNull();
    expect(b.days).toHaveLength(2);
    const c2 = new OpenMeteoClient({ fetchImpl: mockFetch({ failAll: true }).impl });
    await expect(c2.get(37, 37)).rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it('ücretli plan anahtarı varsa müşteri ucuna gider', async () => {
    const m = mockFetch();
    await new OpenMeteoClient({ fetchImpl: m.impl, apiKey: 'k' }).get(37, 37);
    expect(m.urls[0]).toContain('https://customer-api.open-meteo.com');
    expect(m.urls[0]).toContain('apikey=k');
  });

  it('eksik sıcaklık ve boş tahmin reddedilir', () => {
    expect(() => parseBundle({ daily: { time: [] } }, null, 'm', 'x')).toThrow(
      WeatherUnavailableError,
    );
    expect(() =>
      parseBundle({ daily: { time: ['2026-10-20'], temperature_2m_min: [null] } }, null, 'm', 'x'),
    ).toThrow(WeatherUnavailableError);
  });
});

// ---------------------------------------------------------------------------
// Bugün ucu, don olasılığı, bildirim
// ---------------------------------------------------------------------------
const db = new PgliteDb();
const sms = new FakeSmsProvider();
const NOW = new Date('2026-10-21T20:00:00Z'); // yerel 23:00 (UTC+3)
const queue = new InMemoryQueue();
const push = new FakePushClient();
/** Testte hava verisini değiştirmek için ince sarmalayıcı. */
const weather: { current: WeatherProvider; get: WeatherProvider['get'] } = {
  current: new FakeWeatherProvider(),
  get: (lat, lon) => weather.current.get(lat, lon),
};
const setWeather = (make: (lat: number, lon: number) => WeatherBundle) => {
  weather.current = new FakeWeatherProvider(make);
};
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

/** 40 üye: yarısı `cold`, yarısı `warm`. */
const members = (cold: number, warm: number) => [
  ...Array.from({ length: 20 }, () => cold),
  ...Array.from({ length: 20 }, () => warm),
];

let farmer: Awaited<ReturnType<typeof login>>;
let stranger: Awaited<ReturnType<typeof login>>;
let fieldId: string;
const TOKEN = 'ExponentPushToken[abcdefghijkl]';

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  setWeather((lat, lon) => sampleBundle(lat, lon, { now: NOW, memberMinC: members(-5, 4) }));
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      weather,
      queue,
      push,
      now: () => NOW,
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  farmer = await login('+905321110101');
  stranger = await login('+905321110102');
  const f = await call('POST', '/fields', farmer.token, {
    name: 'Burç Köyü Fıstık Bahçesi',
    lat: 37.06,
    lon: 37.38,
    cropId: 'antep-fistigi',
  });
  fieldId = f.body.id;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('GET /fields/:id/today', () => {
  it('giriş ister; başkasının tarlası 403', async () => {
    expect((await call('GET', `/fields/${fieldId}/today`)).status).toBe(401);
    expect((await call('GET', `/fields/${fieldId}/today`, stranger.token)).status).toBe(403);
  });

  it('hava, ET0 (Penman-Monteith) ve kaynak damgası döner', async () => {
    const r = await call('GET', `/fields/${fieldId}/today`, farmer.token);
    expect(r.status).toBe(200);
    expect(r.body.weather.source).toContain('Open-Meteo');
    expect(r.body.weather.fetchedAt).toBe(NOW.toISOString());
    expect(r.body.weather.current.tempC).toBe(12);
    expect(r.body.et0.method).toBe('FAO-56 Penman-Monteith');
    // Örnek günün (8–22 °C, Rs 15 MJ, RH %60) ET0'ı makul aralıkta
    expect(r.body.et0.mmPerDay).toBeGreaterThan(1.5);
    expect(r.body.et0.mmPerDay).toBeLessThan(4);
  });

  it('onaysız paket/eşik: su ihtiyacı ve don uyarısı YOK, rozet var (kural 1)', async () => {
    const r = await call('GET', `/fields/${fieldId}/today`, farmer.token);
    expect(r.body.waterNeed).toMatchObject({
      kind: 'none',
      reason: 'uzman-onayi-bekliyor',
      badge: true,
    });
    expect(r.body.frost.assessment).toMatchObject({
      kind: 'none',
      reason: 'uzman-onayi-bekliyor',
      badge: true,
    });
  });

  it('onaylı paket: ETc = Kc × ET0 hesaplanır', async () => {
    await sql(
      `UPDATE crop_pack_versions SET review_status = 'uzman-onayli' WHERE crop_id = 'antep-fistigi'`,
    );
    const r = await call('GET', `/fields/${fieldId}/today`, farmer.token);
    expect(r.body.waterNeed.kind).toBe('water-need');
    expect(r.body.waterNeed.etcMmPerDay).toBeCloseTo(r.body.waterNeed.kc * r.body.et0.mmPerDay, 6);
    expect(r.body.waterNeed.packVersion).toBe(1);
  });

  it('pakette onaylı eşik yokken (yalnız taslak evre) don uyarısı yine yok', async () => {
    await sql(
      `INSERT INTO crop_stages(pack_id, seq, name_tr, frost_critical_c, review_status, source)
       SELECT id, 1, 'Çiçeklenme', -2, 'taslak-uzman-onayi-bekliyor', 'test' FROM crop_pack_versions
       WHERE crop_id = 'antep-fistigi'`,
    );
    const r = await call('GET', `/fields/${fieldId}/today`, farmer.token);
    expect(r.body.frost.assessment).toMatchObject({ kind: 'none', reason: 'uzman-onayi-bekliyor' });
  });

  it('onaylı eşik: ensemble üyelerinin oranı olasılık olur (20/40 = %50 → uyarı)', async () => {
    await sql(`UPDATE crop_stages SET review_status = 'uzman-onayli' WHERE name_tr = 'Çiçeklenme'`);
    const r = await call('GET', `/fields/${fieldId}/today`, farmer.token);
    const f = r.body.frost;
    expect(f.assessment).toMatchObject({
      kind: 'frost',
      probability: 0.5,
      members: 40,
      level: 'warning',
      thresholdC: -2,
    });
    expect(f.date).toBe('2026-10-22'); // yerel 23:00: bugünün sabahı geçti, sıradaki sabah
    expect(f.dayOffset).toBe(1);
    expect(f.stageName).toBe('Çiçeklenme');
    expect(f.source).toContain('Open-Meteo');
    expect(f.fetchedAt).toBe(NOW.toISOString());
  });

  it('yükselti düzeltmesi 6,5 °C/km: yüksek parselde olasılık artar', async () => {
    setWeather((lat, lon) =>
      sampleBundle(lat, lon, { now: NOW, memberMinC: members(-1, 4), elevationM: 800 }),
    );
    const low = await call('GET', `/fields/${fieldId}/today?elevation=800`, farmer.token);
    expect(low.body.frost.assessment.probability).toBe(0); // −1 °C > −2 °C
    const high = await call('GET', `/fields/${fieldId}/today?elevation=1300`, farmer.token);
    expect(high.body.frost.assessment.probability).toBe(0.5); // −1 − 3,25 = −4,25 °C ≤ −2 °C
    expect(high.body.frost.elevationM).toBe(1300);
    expect((await call('GET', `/fields/${fieldId}/today?elevation=abc`, farmer.token)).status).toBe(
      400,
    );
  });

  it('hava servisi çökerse 503, ensemble yoksa don "veri yok"', async () => {
    weather.current = {
      get: async () => {
        throw new WeatherUnavailableError('test');
      },
    };
    expect((await call('GET', `/fields/${fieldId}/today`, farmer.token)).status).toBe(503);
    setWeather((lat, lon) => ({ ...sampleBundle(lat, lon, { now: NOW }), ensemble: null }));
    const r = await call('GET', `/fields/${fieldId}/today`, farmer.token);
    expect(r.body.frost).toMatchObject({ unavailable: true });
    expect(r.body.frost.assessment.kind).toBe('none');
  });
});

describe('push belirteci ve don bildirimi', () => {
  it('belirteç kaydı yalnız kendi hesabına; başka hesapta aynı cihaz taşınır', async () => {
    expect(
      (await call('POST', '/me/push-token', farmer.token, { token: 'kisa', platform: 'ios' }))
        .status,
    ).toBe(400);
    const ok = await call('POST', '/me/push-token', farmer.token, {
      token: TOKEN,
      platform: 'android',
    });
    expect(ok.status).toBe(200);
    expect((await sql('SELECT user_id FROM push_tokens'))[0]).toMatchObject({
      user_id: farmer.userId,
    });
    // aynı telefonda başka kişi girdi
    await call('POST', '/me/push-token', stranger.token, { token: TOKEN, platform: 'android' });
    expect((await sql('SELECT user_id FROM push_tokens'))[0]).toMatchObject({
      user_id: stranger.userId,
    });
    await call('POST', '/me/push-token', farmer.token, { token: TOKEN, platform: 'android' });
    // başkası belirteci silemez
    await call('DELETE', '/me/push-token', stranger.token, { token: TOKEN });
    expect(await sql('SELECT 1 FROM push_tokens')).toHaveLength(1);
  });

  it('tarama yalnız yöneticiye açık', async () => {
    expect((await call('POST', '/admin/jobs/frost-scan', farmer.token)).status).toBe(403);
  });

  it('olasılık ≥ %50 ve onaylı eşik: gece olsa da don bildirimi gider; ikinci tarama çift göndermez', async () => {
    setWeather((lat, lon) => sampleBundle(lat, lon, { now: NOW, memberMinC: members(-5, 4) }));
    const svc = app.get(NotifyService);

    const first = await svc.scanFrost();
    await queue.idle();
    expect(first).toEqual({ checked: 1, queued: 1, failed: 0 });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      to: TOKEN,
      title: 'Don uyarısı',
      priority: 'high',
      data: { kind: 'frost', fieldId, date: '2026-10-22' },
    });
    expect(push.sent[0]!.body).toContain('bu gece don bekleniyor');
    expect(queue.delayed).toHaveLength(0); // sessiz saat (23:00) don için geçerli değil

    await svc.scanFrost();
    await queue.idle();
    expect(push.sent).toHaveLength(1);
    expect(await sql('SELECT 1 FROM notification_log')).toHaveLength(1);
  });

  it('olasılık düşükse bildirim yok', async () => {
    await sql('DELETE FROM notification_log');
    const svc = app.get(NotifyService);
    setWeather((lat, lon) =>
      sampleBundle(lat, lon, {
        now: NOW,
        memberMinC: members(-5, 4).map((x, i) => (i < 5 ? x : 4)),
      }),
    );
    const before = push.sent.length;
    expect((await svc.scanFrost()).queued).toBe(0);
    await queue.idle();
    expect(push.sent).toHaveLength(before);
  });

  it('onaysız eşikte tarama bildirim üretmez (kural 1)', async () => {
    await sql(`UPDATE crop_stages SET review_status = 'taslak-uzman-onayi-bekliyor'`);
    await sql('DELETE FROM notification_log');
    const svc = app.get(NotifyService);
    setWeather((lat, lon) => sampleBundle(lat, lon, { now: NOW, memberMinC: members(-9, -9) }));
    const before = push.sent.length;
    expect((await svc.scanFrost()).queued).toBe(0);
    await queue.idle();
    expect(push.sent).toHaveLength(before);
  });
});
