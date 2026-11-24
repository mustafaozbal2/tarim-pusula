import { hizSiniri } from './hiz-siniri';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { MarketCollector } from './market/collector';
import { createSmsProvider } from './auth/sms';
import { importCalendarTemplates } from './calendar';
import { importResmiKaynaklar } from './tarama/kaynak';
import { bekleyenleriYayinla } from './onay';
import { importCropCatalog } from './crops';
import { ExpoPushClient, FakePushClient, createQueue } from '@tarim/workers';
import { OpenMeteoClient, FakeWeatherProvider } from './weather/openmeteo';
import { ChainWeatherProvider, MetNorwayClient } from './weather/metno';
import { corsOrigins, securityHeaders } from './security';
import { GovdeHatasiFiltresi } from './govde-hatasi';
import { migrate, PgDb, PgliteDb, type Db } from './db/db';

async function bootstrap() {
  const url = process.env['DATABASE_URL'];
  let db: Db;
  if (url) {
    db = new PgDb(url);
  } else {
    console.warn('DATABASE_URL yok: süreç içi geçici veritabanı kullanılıyor (veri kalıcı değil).');
    db = new PgliteDb();
  }
  await migrate(db);
  await importCropCatalog(db);
  await importCalendarTemplates(db);
  await importResmiKaynaklar(db);
  await bekleyenleriYayinla(db);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({
      db,
      sms: createSmsProvider(),
      weather:
        process.env['WEATHER_PROVIDER'] === 'fake'
          ? new FakeWeatherProvider()
          : new ChainWeatherProvider([
              new OpenMeteoClient({ apiKey: process.env['OPEN_METEO_API_KEY'] || undefined }),
              new MetNorwayClient(),
            ]),
      queue: createQueue(),
      push:
        process.env['PUSH_PROVIDER'] === 'expo'
          ? new ExpoPushClient({ accessToken: process.env['EXPO_ACCESS_TOKEN'] || undefined })
          : new FakePushClient(),
    }),
  );
  // PDF yükleme base64 geldiğinden gövde sınırı varsayılandan (100 kb) yüksek.
  app.useBodyParser('json', { limit: '30mb' });
  app.disable('x-powered-by');
  app.useGlobalFilters(new GovdeHatasiFiltresi());
  app.use(securityHeaders({ hsts: process.env['NODE_ENV'] === 'production' }));
  // Render önünde tek vekil var: gerçek istemci IP'si X-Forwarded-For'dan (hız sınırı IP başına sayar)
  app.set('trust proxy', 1);
  app.use(hizSiniri({ genel: 300, yz: 20 }));
  // Kimlik doğrulama çerezle değil Bearer jetonla olduğundan CORS CSRF riski doğurmaz; üretimde CORS_ORIGINS zorunlu.
  app.enableCors({ origin: corsOrigins(process.env) });
  await app.listen(Number(process.env['PORT'] ?? 3000));
  // Fiyat toplayıcıları: boşsa kapalı. Kaynak başına tekrar çekim aralığı ve robots.txt yine uygulanır.
  app.get(MarketCollector).zamanla();
}

void bootstrap();
