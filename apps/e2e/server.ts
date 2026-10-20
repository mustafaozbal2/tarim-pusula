import 'reflect-metadata';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { InMemoryBroker, VirtualDevice } from '@tarim/device-sim';
import { AppModule } from '../api/src/app.module';
import { FakeSmsProvider } from '../api/src/auth/sms';
import { importCropCatalog } from '../api/src/crops';
import { MarketCollector, type MarketSourceConfig } from '../api/src/market/collector';
import { parseBorsaBulletin } from '../api/src/market/parse';
import { readFileSync } from 'node:fs';
import { migrate, PgliteDb, systemTx } from '../api/src/db/db';
import { FakeWeatherProvider, sampleBundle } from '../api/src/weather/openmeteo';

/**
 * Uçtan uca test sunucusu: gerçek API (süreç içi Postgres + sahte SMS) ve mobil uygulamanın
 * web paketi (apps/mobile/dist) aynı süreçte. Test yardımcı uçları /__e2e/* altındadır ve
 * yalnız bu betik tarafından açılır.
 */
const API_PORT = Number(process.env['E2E_API_PORT'] ?? 3111);
const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 8111);
const DIST = resolve(import.meta.dirname, '../mobile/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

async function main() {
  const db = new PgliteDb();
  const sms = new FakeSmsProvider();
  await migrate(db);
  const broker = new InMemoryBroker();
  await importCropCatalog(db);
  // Pazar: dış ağ yok. Borsa bülteni kayıtlı örnekten, tarihi BUGÜN olacak biçimde sunulur.
  const today = new Date();
  const trDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  const bulletin = readFileSync(
    resolve(import.meta.dirname, '../api/src/market/fixtures/borsa_bulteni.html'),
    'utf8',
  ).replace('19.10.2026', trDate);
  const marketSources: MarketSourceConfig[] = [
    {
      id: 'borsa-bulten',
      name: 'Gaziantep Ticaret Borsası',
      url: 'https://borsa.e2e.test/bulten.html',
      licenseNote: 'e2e',
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
  const marketFetch = (async (url: string) => {
    const isRobots = url.endsWith('/robots.txt');
    return {
      ok: !isRobots,
      status: isRobots ? 404 : 200,
      text: async () => (isRobots ? '' : bulletin),
    };
  }) as unknown as typeof fetch;
  const app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'e2e' },
      broker,
      market: { fetch: marketFetch, sources: marketSources },
      // Dış ağ yok: hava sahte, ensemble üyelerinin hepsi -6 °C (don olasılığı %100).
      weather: new FakeWeatherProvider((lat, lon) =>
        sampleBundle(lat, lon, { memberMinC: Array.from({ length: 20 }, () => -6) }),
      ),
    }),
    {
      logger: false,
    },
  );
  app.enableCors();
  await app.listen(API_PORT);

  let counter = 0;
  const api = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${API_PORT}${path}`, init);

  async function newUser() {
    const phone = `+90532${String(7_000_000 + ++counter)}`;
    await api('/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const r = await api('/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code: sms.lastCode(phone) }),
    });
    return { phone, ...((await r.json()) as { token: string; userId: string }) };
  }

  const web = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      res.setHeader('access-control-allow-origin', '*');
      if (url.pathname === '/__e2e/market-collect') {
        const out = await app.get(MarketCollector).runAll({ force: true });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out));
        return;
      }
      if (url.pathname === '/__e2e/user') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ api: `http://127.0.0.1:${API_PORT}`, ...(await newUser()) }));
        return;
      }
      if (url.pathname === '/__e2e/irrigation') {
        // Test için: tarla + kurulu cihaz + bağlı sanal ESP32 (vana kapalı).
        const u = await newUser();
        const call = async (path: string, body?: unknown) =>
          (await (
            await api(path, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${u.token}` },
              body: body === undefined ? undefined : JSON.stringify(body),
            })
          ).json()) as Record<string, string>;
        const field = await call('/fields', {
          name: 'Burç Köyü Fıstık Bahçesi',
          lat: 37.1,
          lon: 37.4,
        });
        const dev = await call('/devices', { fieldId: field['id'], name: 'Fıstık bahçesi vanası' });
        const prov = await call(`/devices/${dev['id']}/provision`);
        const device = new VirtualDevice({ id: dev['id']!, secret: prov['secret']!, broker });
        await device.connect();
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ api: `http://127.0.0.1:${API_PORT}`, ...u, deviceId: dev['id'] }));
        return;
      }
      if (url.pathname === '/__e2e/staff') {
        // Test için: verilen rolde panel kullanıcısı (telefonla SMS girişi yapılabilir).
        const u = await newUser();
        const role = url.searchParams.get('role') ?? 'institution_admin';
        await systemTx(db, (q) =>
          q.query('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
            u.userId,
            role,
          ]),
        );
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ api: `http://127.0.0.1:${API_PORT}`, ...u }));
        return;
      }
      if (url.pathname === '/__e2e/approve-frost') {
        // Test için: Antep fıstığı paketini ve çiçeklenme eşiğini (-2 °C) "uzman onaylı" yapar.
        await systemTx(db, async (q) => {
          await q.query(
            `UPDATE crop_pack_versions SET review_status = 'uzman-onayli' WHERE crop_id = 'antep-fistigi'`,
          );
          await q.query(
            `INSERT INTO crop_stages(pack_id, seq, name_tr, frost_critical_c, review_status, source)
             SELECT id, 1, 'Çiçeklenme', -2, 'uzman-onayli', 'e2e' FROM crop_pack_versions
             WHERE crop_id = 'antep-fistigi' ON CONFLICT DO NOTHING`,
          );
        });
        res.end('ok');
        return;
      }
      if (url.pathname === '/__e2e/health') {
        res.end('ok');
        return;
      }
      if (url.pathname === '/__e2e/otp') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ code: sms.lastCode(url.searchParams.get('phone') ?? '') }));
        return;
      }
      const safe = normalize(url.pathname).replace(/^([/\\])+/, '');
      let file = join(DIST, safe);
      if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
        file = join(DIST, 'index.html'); // tek sayfa uygulaması
      }
      res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    })().catch((e) => {
      res.statusCode = 500;
      res.end(String(e));
    });
  });
  web.listen(WEB_PORT, () => console.log(`e2e hazır: web ${WEB_PORT}, api ${API_PORT}`));
}

void main();
