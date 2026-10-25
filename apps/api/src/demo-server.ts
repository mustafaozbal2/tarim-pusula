import 'reflect-metadata';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { InMemoryBroker, VirtualDevice } from '@tarim/device-sim';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCalendarTemplates } from './calendar';
import { importCropCatalog } from './crops';
import {
  DEMO_FARMER_PHONE,
  DEMO_FIELDS,
  DEMO_STAFF_PHONE,
  demoInfo,
  demoMarket,
  seedDemoData,
  seedDemoMarket,
} from './demo';
import { migrate, PgliteDb, systemTx } from './db/db';
import { MarketCollector } from './market/collector';
import {
  FakeWeatherProvider,
  FallbackWeatherProvider,
  OpenMeteoClient,
  sampleBundle,
  type WeatherProvider,
} from './weather/openmeteo';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export interface DemoOptions {
  apiPort: number;
  webPort: number;
  /** Mobil uygulamanın web paketi (expo export çıktısı). */
  webDir: string;
  /** Dinlenen adres. Varsayılan yalnız bu bilgisayar (127.0.0.1); `--lan` için 0.0.0.0. */
  host?: string;
  /**
   * Hava sağlayıcısı. Verilmezse GERÇEK Open-Meteo (anahtarsız); ağ yoksa/hata olursa örnek veriye düşer
   * ve ekranda "Örnek veri" yazar. `DEMO_WEATHER=ornek` ile hep örnek veri (testler ağsız çalışır).
   */
  weather?: WeatherProvider;
}

/** Demo örnek havası: ensemble üyelerinin hepsi -6 °C → güncel tarihli don uyarısı (dış ağ yok). */
export function demoSampleWeather(): FakeWeatherProvider {
  return new FakeWeatherProvider((lat, lon) =>
    sampleBundle(lat, lon, { memberMinC: Array.from({ length: 20 }, () => -6) }),
  );
}

/** Demo havası: varsayılan gerçek Open-Meteo + örnek veri yedeği. */
export function demoWeather(env: NodeJS.ProcessEnv = process.env): WeatherProvider {
  if (env['DEMO_WEATHER'] === 'ornek') return demoSampleWeather();
  return new FallbackWeatherProvider(
    new OpenMeteoClient({ timeoutMs: 6000, apiKey: env['OPEN_METEO_API_KEY'] || undefined }),
    demoSampleWeather(),
  );
}

export interface DemoHandle {
  close(): Promise<void>;
}

/** Statik web sunucusu: tek sayfa uygulaması; /health 200 döner. */
function serveStatic(dir: string): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.end('ok');
      return;
    }
    const safe = normalize(url.pathname).replace(/^([/\\])+/, '');
    let file = join(dir, safe);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(dir, 'index.html');
    }
    if (!existsSync(file)) {
      res.statusCode = 503;
      res.end('Mobil web paketi yok: önce `pnpm run demo` ile derleyin.');
      return;
    }
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
}

/**
 * Demo: süreç içi Postgres + sahte SMS/hava/uydu/LLM; Docker ve dış ağ gerekmez.
 * Yalnız `DEMO_MODE=1` iken çalışır.
 */
export async function startDemo(o: DemoOptions): Promise<DemoHandle> {
  const info = demoInfo();
  if (!info) throw new Error('Demo yalnız DEMO_MODE=1 ve üretim dışı ortamda çalışır.');
  const db = new PgliteDb();
  await migrate(db);
  await importCropCatalog(db);
  await importCalendarTemplates(db);
  await seedDemoData(db);
  const broker = new InMemoryBroker();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({
      db,
      sms: new FakeSmsProvider(),
      demo: info,
      broker,
      market: demoMarket(),
      weather: o.weather ?? demoWeather(),
    }),
    { logger: false },
  );
  app.enableCors();
  app.useBodyParser('json', { limit: '1mb' }); // duyuru görseli (en çok ~300 KB)
  await app.listen(o.apiPort, o.host ?? '127.0.0.1');
  const base = `http://127.0.0.1:${o.apiPort}`;

  const post = async (path: string, token: string | undefined, body?: unknown) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`demo tohumu ${path}: ${r.status} ${await r.text()}`);
    return (await r.json()) as Record<string, string>;
  };
  const login = async (phone: string) => {
    await post('/auth/otp/request', undefined, { phone });
    return post('/auth/otp/verify', undefined, { phone, code: info.code });
  };

  // Çiftçi: 2 tarla + bağlı sanal sulama cihazı.
  const farmer = await login(DEMO_FARMER_PHONE);
  const fieldIds: string[] = [];
  for (const f of DEMO_FIELDS) {
    const r = await post('/fields', farmer['token'], { ...f, locationSource: 'koy' });
    fieldIds.push(r['id']!);
  }
  const dev = await post('/devices', farmer['token'], {
    fieldId: fieldIds[0],
    name: 'Fıstık bahçesi vanası (sanal cihaz)',
  });
  const prov = await post(`/devices/${dev['id']}/provision`, farmer['token']);
  await new VirtualDevice({ id: dev['id']!, secret: prov['secret']!, broker }).connect();

  // Kurum yöneticisi.
  const staff = await login(DEMO_STAFF_PHONE);
  await systemTx(db, (q) =>
    q.query('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
      staff['userId'],
      'institution_admin',
    ]),
  );
  await seedDemoMarket(app.get(MarketCollector));

  const web = serveStatic(resolve(o.webDir));
  await new Promise<void>((ok) => web.listen(o.webPort, o.host ?? '127.0.0.1', ok));
  return {
    close: async () => {
      web.close();
      await app.close();
    },
  };
}

if (process.argv[1] && /demo-server\.[tj]s$/.test(process.argv[1])) {
  const apiPort = Number(process.env['DEMO_API_PORT'] ?? 8210);
  const webPort = Number(process.env['DEMO_WEB_PORT'] ?? 8200);
  const webDir =
    process.env['DEMO_WEB_DIR'] ?? resolve(import.meta.dirname, '../../mobile/dist-demo');
  startDemo({ apiPort, webPort, webDir, host: process.env['DEMO_HOST'] })
    .then(() => console.log(`demo hazır: api ${apiPort}, mobil web ${webPort}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
