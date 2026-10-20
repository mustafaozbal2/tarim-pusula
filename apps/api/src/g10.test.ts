/* eslint-disable @typescript-eslint/no-explicit-any -- testlerde yanıt gövdesi serbest biçimli */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
import { migrate, PgliteDb, systemTx } from './db/db';
import { type MarketSourceConfig } from './market/collector';
import {
  cropIdFor,
  parseBorsaBulletin,
  parseIbbHal,
  parseTepge,
  parseTrNumber,
} from './market/parse';
import { parseRobots, robotsAllows } from './market/robots';
import { Places } from './places';

const fx = (f: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'market', 'fixtures', f), 'utf8');

describe('ayrıştırıcılar (kayıtlı örnek yanıtlar)', () => {
  it('İBB hal: kg/ton çevrilir, adet ve sıfır fiyat atılır, ürün eşlenir', () => {
    const r = parseIbbHal(fx('ibb_hal.json'));
    const by = Object.fromEntries(r.map((x) => [x.productName, x]));
    expect(r).toHaveLength(5); // Marul (adet) ve Karpuz (0 ₺) atıldı
    expect(by['Domates (Sofralık)']).toMatchObject({
      cropId: 'domates',
      priceMin: 18.5,
      priceMax: 26,
      priceDate: '2026-10-19',
    });
    expect(by['Antep Fıstığı (Kabuklu)']).toMatchObject({
      cropId: 'antep-fistigi',
      priceMin: 270,
      priceMax: 310,
    });
    expect(by['Pamuk']).toMatchObject({ cropId: 'pamuk', priceMin: 41, priceMax: 47 }); // ton -> kg
    expect(by['Yer Fıstığı']!.cropId).toBeNull(); // yer fıstığı Antep fıstığı değildir
    expect(by['Zeytin (Yeşil)']!.cropId).toBe('zeytin');
  });
  it('İBB hal: bozuk girdi boş döner, çökmez', () => {
    expect(parseIbbHal('<html>bakım</html>')).toEqual([]);
    expect(parseIbbHal('{"data":[{"ProductName":"Domates"}]}')).toEqual([]);
    expect(parseIbbHal('{"data":[]}')).toEqual([]);
  });
  it('TEPGE aylık: Türkçe sayı, iki dönem biçimi, ay sonu tarihi; başlık/bozuk satır atlanır', () => {
    const r = parseTepge(fx('tepge_aylik.csv'));
    expect(r).toHaveLength(6); // başlık ve "Bozuk satır" atıldı; zeytinyağı kaydedilir ama ürünsüzdür
    const bugday = r.find((x) => x.productName.startsWith('Buğday'))!;
    expect(bugday).toMatchObject({ cropId: 'bugday', priceDate: '2026-09-30' });
    expect(bugday.priceMin).toBeCloseTo(11.25, 10); // 11.250 TL/ton
    expect(r.filter((x) => x.cropId === 'antep-fistigi').map((x) => x.priceDate)).toEqual([
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
    ]);
    expect(r.find((x) => x.productName.startsWith('Zeytinyağı'))!.cropId).toBeNull();
  });
  it('Borsa bülteni: tarih başlıktan, birim çevrimi, çuval gibi birimler atılır', () => {
    const r = parseBorsaBulletin(fx('borsa_bulteni.html'));
    expect(r).toHaveLength(3); // Zeytin çuval atıldı
    expect(r[0]).toMatchObject({
      productName: 'Antep Fıstığı (Kabuklu)',
      cropId: 'antep-fistigi',
      priceMin: 275,
      priceMax: 295.5,
      priceDate: '2026-10-19',
    });
    expect(r[1]).toMatchObject({ cropId: 'bugday', priceMin: 11.2, priceMax: 11.6 });
  });
  it('tarihsiz bülten fiyat üretmez (kaynaksız/tarihsiz fiyat yok)', () => {
    expect(parseBorsaBulletin(fx('borsa_bulteni.html').replace('Tarih: 19.10.2026', ''))).toEqual(
      [],
    );
  });
  it('sayı ve ürün yardımcıları', () => {
    expect(parseTrNumber('1.250,50')).toBe(1250.5);
    expect(parseTrNumber('12,5 ₺')).toBe(12.5);
    expect(parseTrNumber('abc')).toBeNull();
    expect(cropIdFor('ANTEP FISTIĞI')).toBe('antep-fistigi');
    expect(cropIdFor('Zeytinyağı')).toBeNull();
    expect(cropIdFor('Elma')).toBeNull();
  });
});

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /api/\nAllow: /api/public/\nCrawl-Delay: 10\n\nUser-agent: BadBot\nDisallow: /\n`;
  it('yasak, daha uzun Allow, Crawl-Delay', () => {
    const r = parseRobots(txt);
    expect(r.crawlDelaySec).toBe(10);
    expect(robotsAllows(r, '/api/prices')).toBe(false);
    expect(robotsAllows(r, '/api/public/prices')).toBe(true);
    expect(robotsAllows(r, '/fiyat')).toBe(true);
  });
  it('bizim adımıza özel grup varsa o uygulanır', () => {
    const r = parseRobots('User-agent: TarimPusulaBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n');
    expect(robotsAllows(r, '/x')).toBe(false);
  });
  it('joker ve satır sonu', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\n');
    expect(robotsAllows(r, '/a/b.pdf')).toBe(false);
    expect(robotsAllows(r, '/a/b.pdf.html')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

const db = new PgliteDb();
const sms = new FakeSmsProvider();
let app: INestApplication;
let base: string;
const NOW = new Date('2026-10-20T09:00:00Z');
let clock = NOW.getTime();

const HAL = 'https://hal.example.test/api/prices';
const TEPGE = 'https://tepge.example.test/aylik.csv';
const BORSA = 'https://borsa.example.test/bulten.html';

/** Taklit ağ: yol -> yanıt; çağrılar kaydedilir. */
const routes = new Map<string, { status: number; body: string }>();
const calls: string[] = [];
const sleeps: number[] = [];
const fakeFetch = (async (url: string) => {
  calls.push(url);
  const r = routes.get(url) ?? { status: 404, body: 'yok' };
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body };
}) as unknown as typeof fetch;

const sources: MarketSourceConfig[] = [
  {
    id: 'ibb-hal',
    name: 'İBB Hal Fiyatları',
    url: HAL,
    licenseNote: 'test',
    formatVersion: 'ibb-hal-v1',
    parse: parseIbbHal,
    place: {
      id: 'ibb-hal-istanbul',
      name: 'İstanbul Hali',
      province: 'İstanbul',
      lat: 41.0082,
      lon: 28.9784,
      approx: true,
    },
  },
  {
    id: 'tepge-aylik',
    name: 'TEPGE aylık',
    url: TEPGE,
    licenseNote: 'test',
    formatVersion: 'tepge-aylik-v1',
    parse: parseTepge,
    place: {
      id: 'tepge-ulusal',
      name: 'Türkiye geneli',
      province: null,
      lat: null,
      lon: null,
      approx: false,
    },
  },
  {
    id: 'borsa-bulten',
    name: 'Gaziantep Ticaret Borsası',
    url: BORSA,
    licenseNote: 'test',
    formatVersion: 'borsa-bulten-v1',
    parse: parseBorsaBulletin,
    place: {
      id: 'borsa-gaziantep',
      name: 'Gaziantep Ticaret Borsası',
      province: 'Gaziantep',
      lat: 37.0662,
      lon: 37.3833,
      approx: true,
    },
  },
];

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
const collect = (token: string) => call('POST', '/admin/jobs/market-collect', token);

function setRoutes(robots: { status: number; body: string } = { status: 404, body: '' }) {
  routes.clear();
  calls.length = 0;
  sleeps.length = 0;
  for (const o of ['hal', 'tepge', 'borsa'])
    routes.set(`https://${o}.example.test/robots.txt`, robots);
  routes.set(HAL, { status: 200, body: fx('ibb_hal.json') });
  routes.set(TEPGE, { status: 200, body: fx('tepge_aylik.csv') });
  routes.set(BORSA, { status: 200, body: fx('borsa_bulteni.html') });
}

let admin: Awaited<ReturnType<typeof login>>;
let ali: Awaited<ReturnType<typeof login>>;
let veli: Awaited<ReturnType<typeof login>>;
let fieldId: string;

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      places: Places.load(),
      now: () => new Date(clock),
      market: { fetch: fakeFetch, sources, sleep: async (ms) => void sleeps.push(ms) },
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  admin = await login('+905321100001');
  ali = await login('+905321100002');
  veli = await login('+905321100003');
  await sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
    admin.userId,
    'admin',
  ]);
  const f = await call('POST', '/fields', ali.token, { name: 'Burç Fıstık', lat: 37.1, lon: 37.4 });
  fieldId = f.body.id;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('toplayıcı: robots, kaynak künyesi, tekrar aralığı', () => {
  it('yalnız yönetici çalıştırır', async () => {
    setRoutes();
    expect((await collect(ali.token)).status).toBe(403);
    expect((await call('POST', '/admin/jobs/market-collect')).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('robots.txt yoksa (404) çeker; her satır kaynak + tarih + sürüm + adres + özet taşır', async () => {
    setRoutes();
    const r = await collect(admin.token);
    expect(r.status).toBe(200);
    expect(r.body.map((x: any) => [x.sourceId, x.status, x.stored])).toEqual([
      ['ibb-hal', 'ok', 5],
      ['tepge-aylik', 'ok', 6],
      ['borsa-bulten', 'ok', 3],
    ]);
    const rows = await sql<any>(
      `SELECT source_id, source_version, source_url, raw_sha256, price_date::text AS d FROM market_prices WHERE crop_id = 'antep-fistigi' ORDER BY source_id, price_date`,
    );
    expect(rows.length).toBe(5); // hal 1 + tepge 3 + borsa 1
    for (const x of rows) {
      expect(x.source_version).toMatch(/^[a-z-]+-v1@2026-10-20$/);
      expect(x.source_url).toMatch(/^https:\/\//);
      expect(x.raw_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const [s] = await sql<any>(
      "SELECT robots_allowed, last_status FROM market_sources WHERE id = 'ibb-hal'",
    );
    expect(s).toMatchObject({ robots_allowed: true, last_status: 'ok' });
    expect(calls.filter((c) => c.endsWith('robots.txt'))).toHaveLength(3); // her kaynak için önce robots
  });

  it('tekrar çekim aralığı: 6 saatten önce ikinci istek yapılmaz; sonra aynı gün güncellenir (çift kayıt yok)', async () => {
    setRoutes();
    expect((await collect(admin.token)).body.map((x: any) => x.status)).toEqual([
      'throttled',
      'throttled',
      'throttled',
    ]);
    expect(calls).toEqual([]);
    clock += 7 * 3600_000;
    const r = await collect(admin.token);
    expect(r.body.map((x: any) => x.status)).toEqual(['ok', 'ok', 'ok']);
    const [n] = await sql<{ n: number }>(
      "SELECT count(*)::int AS n FROM market_prices WHERE source_id = 'ibb-hal'",
    );
    expect(n!.n).toBe(5);
  });

  it('robots.txt yasaklıyorsa veri adresine HİÇ istek atılmaz', async () => {
    setRoutes({ status: 200, body: 'User-agent: *\nDisallow: /\n' });
    clock += 7 * 3600_000;
    const r = await collect(admin.token);
    expect(r.body.map((x: any) => x.status)).toEqual(['blocked', 'blocked', 'blocked']);
    expect(calls.every((c) => c.endsWith('/robots.txt'))).toBe(true);
    const [s] = await sql<any>("SELECT robots_allowed FROM market_sources WHERE id = 'ibb-hal'");
    expect(s.robots_allowed).toBe(false);
  });

  it('robots.txt sunucu hatası verirse (belirsiz) çekilmez', async () => {
    setRoutes({ status: 503, body: '' });
    clock += 7 * 3600_000;
    const r = await collect(admin.token);
    expect(r.body.map((x: any) => x.status)).toEqual(['blocked', 'blocked', 'blocked']);
    expect(calls.every((c) => c.endsWith('/robots.txt'))).toBe(true);
  });

  it('Crawl-Delay kadar beklenir', async () => {
    setRoutes({ status: 200, body: 'User-agent: *\nCrawl-Delay: 10\n' });
    clock += 7 * 3600_000;
    await collect(admin.token);
    expect(sleeps).toEqual([10_000, 10_000, 10_000]);
  });

  it('veri adresi hata verirse / boş çıkarsa kayıt yazılmaz ve durum işlenir', async () => {
    setRoutes();
    routes.set(HAL, { status: 500, body: '' });
    routes.set(TEPGE, { status: 200, body: 'bakım sayfası' });
    clock += 7 * 3600_000;
    const r = await collect(admin.token);
    expect(r.body.map((x: any) => x.status)).toEqual(['error', 'empty', 'ok']);
    const [s] = await sql<any>("SELECT last_status FROM market_sources WHERE id = 'ibb-hal'");
    expect(s.last_status).toContain('HTTP 500');
  });
});

describe('veritabanı: kaynaksız fiyat tutulamaz', () => {
  const ins = (over: Record<string, string>) => {
    const v = {
      source_version: "'v1'",
      source_url: "'https://x.test'",
      raw: `'${'a'.repeat(64)}'`,
      min: '10',
      max: '12',
      ...over,
    };
    return sql(
      `INSERT INTO market_prices (source_id, place_id, crop_id, product_name, price_min, price_max, price_date, fetched_at, source_version, source_url, raw_sha256)
       VALUES ('ibb-hal', 'ibb-hal-istanbul', 'zeytin', 'Deneme', ${v.min}, ${v.max}, '2026-01-01', now(), ${v.source_version}, ${v.source_url}, ${v.raw})`,
    );
  };
  it('boş sürüm, boş adres, bozuk özet, sıfır/ters fiyat reddedilir', async () => {
    await expect(ins({ source_version: "' '" })).rejects.toThrow();
    await expect(ins({ source_url: "''" })).rejects.toThrow();
    await expect(ins({ raw: "'xyz'" })).rejects.toThrow();
    await expect(ins({ min: '0' })).rejects.toThrow();
    await expect(ins({ min: '13' })).rejects.toThrow(); // min > max
    await expect(ins({})).resolves.toBeDefined(); // tam künyeli kayıt geçer
    await sql("DELETE FROM market_prices WHERE product_name = 'Deneme'");
  });
  it('uygulama rolü fiyat yazamaz', async () => {
    await expect(
      systemTx(db, async (q) => {
        await q.exec('SET LOCAL ROLE tp_app');
        await q.query(
          `INSERT INTO market_prices (source_id, place_id, product_name, price_min, price_max, price_date, fetched_at, source_version, source_url, raw_sha256)
           VALUES ('ibb-hal', 'ibb-hal-istanbul', 'Sahte', 1, 2, '2026-01-01', now(), 'v', 'u', '${'b'.repeat(64)}')`,
        );
      }),
    ).rejects.toThrow();
  });
});

describe('GET /market/*', () => {
  beforeAll(async () => {
    // Borsa için 40 günlük geçmiş: fiyat günde 1 ₺ artar (ortalama = 250 + gün).
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.parse('2026-09-10T00:00:00Z') + i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      if (d === '2026-10-19') continue; // o gün toplayıcıdan geldi
      await sql(
        `INSERT INTO market_prices (source_id, place_id, crop_id, product_name, price_min, price_max, price_date, fetched_at, source_version, source_url, raw_sha256)
         VALUES ('borsa-bulten', 'borsa-gaziantep', 'antep-fistigi', 'Antep Fıstığı (Kabuklu)', $1, $2, $3, now(), 'borsa-bulten-v1@gecmis', $4, $5)
         ON CONFLICT DO NOTHING`,
        [240 + i, 260 + i, d, BORSA, 'c'.repeat(64)],
      );
    }
  });

  it('giriş şart', async () => {
    expect((await call('GET', '/market/prices?crop=zeytin')).status).toBe(401);
    expect((await call('GET', '/market/crops')).status).toBe(401);
  });

  it('ürün listesi yalnız fiyatı olanları verir', async () => {
    const r = await call('GET', '/market/crops', ali.token);
    const ids = r.body.map((c: any) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(['antep-fistigi', 'zeytin', 'bugday', 'pamuk', 'domates']),
    );
    expect(ids).not.toContain('nohut');
  });

  it('fiyat: kaynak + tarih + sürüm, trend, mesafe, net aralık', async () => {
    const r = await call('GET', `/market/prices?crop=antep-fistigi&fieldId=${fieldId}`, ali.token);
    expect(r.status).toBe(200);
    const b = r.body;
    expect(b.cropName).toBe('Antep fıstığı');
    // Başlık: en yeni tarih (19 Ekim) ve konumlu yer.
    expect(b.current.date).toBe('2026-10-19');
    expect(b.current.source).toMatchObject({
      name: expect.any(String),
      date: '2026-10-19',
      version: expect.stringMatching(/@2026-10-/),
    });
    // Nerede satarım: Gaziantep borsası tarlaya ~4 km, İstanbul hali ~700+ km; en yakın başta.
    expect(b.places.map((p: any) => p.placeId)).toEqual(['borsa-gaziantep', 'ibb-hal-istanbul']);
    expect(b.places[0].distanceKm).toBeGreaterThan(2);
    expect(b.places[0].distanceKm).toBeLessThan(8);
    expect(b.places[1].distanceKm).toBeGreaterThan(700);
    expect(b.places[0].approxLocation).toBe(true);
    // Ulusal aylık kayıt ayrı listede ve eskidir (45 günden eski değil ama aylık: Eylül sonu).
    expect(b.national.map((p: any) => p.placeId)).toEqual(['tepge-ulusal']);
    expect(b.national[0].distanceKm).toBeNull();
    expect(b.national[0].source.name).toContain('TEPGE');
    // Trend: günde ~+1 ₺ (fiyat ~270) -> ~ %11 / 30 gün, yukarı.
    expect(b.places[0].trend.direction).toBe('up');
    expect(b.places[0].trend.changePct30d).toBeGreaterThan(9);
    expect(b.places[0].trend.changePct30d).toBeLessThan(13);
    // Net aralık: komisyon/nakliye verilmedi -> hesaba katılmadı yazar; P10 < P50 < P90.
    const n = b.places[0].net;
    expect(n.kind).toBe('range');
    expect(n.p10).toBeLessThan(n.p50);
    expect(n.p50).toBeLessThan(n.p90);
    expect(n.assumptions).toEqual(['Nakliye hesaba katılmadı', 'Komisyon hesaba katılmadı']);
    // Tek günlük İBB kaydı: aralık için yeterli gün yok, trend bilinmiyor (uydurma yok).
    expect(b.places[1].net.kind).toBe('insufficient');
    expect(b.places[1].trend.direction).toBe('unknown');
  });

  it('net aralık kesintilerle: net = fiyat(1-komisyon) - nakliye', async () => {
    const plain = (
      await call('GET', `/market/prices?crop=antep-fistigi&fieldId=${fieldId}`, ali.token)
    ).body.places[0];
    const r = await call(
      'GET',
      `/market/prices?crop=antep-fistigi&fieldId=${fieldId}&transport=5&commission=0.1`,
      ali.token,
    );
    const p = r.body.places[0];
    const nakliye = (5 * p.distanceKm) / 1000;
    expect(p.net.p10).toBeCloseTo(plain.net.p10 * 0.9 - nakliye, 6);
    expect(p.net.p90).toBeCloseTo(plain.net.p90 * 0.9 - nakliye, 6);
    expect(p.net.assumptions).toEqual(['Nakliye hesaba katıldı', 'Komisyon hesaba katıldı']);
    expect(r.body.inputs).toEqual({ transportTlPerTonKm: 5, commissionRate: 0.1 });
  });

  it('geçersiz girdi 400', async () => {
    expect((await call('GET', '/market/prices', ali.token)).status).toBe(400);
    expect((await call('GET', '/market/prices?crop=zeytin&commission=1', ali.token)).status).toBe(
      400,
    );
    expect((await call('GET', '/market/prices?crop=zeytin&transport=abc', ali.token)).status).toBe(
      400,
    );
    expect((await call('GET', '/market/prices?crop=zeytin&transport=-3', ali.token)).status).toBe(
      400,
    );
  });

  it('başkasının tarlasının konumu mesafe için kullanılamaz (403)', async () => {
    expect(
      (await call('GET', `/market/prices?crop=zeytin&fieldId=${fieldId}`, veli.token)).status,
    ).toBe(403);
  });

  it('fiyatı olmayan ürün: current null, liste boş (uydurma yok)', async () => {
    const r = await call('GET', '/market/prices?crop=nohut', ali.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ current: null, places: [], national: [] });
  });

  it('eski veri "güncel değil" işaretlenir', async () => {
    clock = NOW.getTime() + 20 * 86_400_000; // 9 Kasım: günlük kaynak 21 gün eski, aylık 40 gün
    const r = await call('GET', '/market/prices?crop=antep-fistigi', ali.token);
    expect(r.body.places[0].stale).toBe(true);
    expect(r.body.national[0].stale).toBe(false); // aylık kaynak 45 güne kadar
    clock = NOW.getTime();
  });
});

describe('Pusula get_price aracı', () => {
  it('kaynaklı fiyat kartı: kaynak adı + tarih + sürüm', async () => {
    const r = await call('POST', '/pusula/ask', ali.token, {
      question: 'Antep fıstığı fiyatı kaç lira?',
    });
    expect(r.status).toBe(200);
    expect(r.body.card.kind).toBe('answer');
    expect(r.body.card.steps.join(' ')).toMatch(/₺/);
    expect(r.body.card.sources[0]).toMatchObject({ date: '2026-10-19', needsBadge: false });
    expect(r.body.card.sources[0].version).toMatch(/@/);
  });
  it('fiyatı olmayan ürün: uydurmaz, "veri yok" der', async () => {
    const r = await call('POST', '/pusula/ask', ali.token, { question: 'Nohut fiyatı kaç lira?' });
    expect(r.body.card).toMatchObject({ kind: 'info', reason: 'veri-yok' });
  });
});
