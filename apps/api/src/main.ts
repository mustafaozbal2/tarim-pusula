import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { MarketCollector } from './market/collector';
import { createSmsProvider } from './auth/sms';
import { importCalendarTemplates } from './calendar';
import { importCropCatalog } from './crops';
import { ExpoPushClient, FakePushClient, createQueue } from '@tarim/workers';
import { OpenMeteoClient, FakeWeatherProvider } from './weather/openmeteo';
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
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({
      db,
      sms: createSmsProvider(),
      weather:
        process.env['WEATHER_PROVIDER'] === 'fake'
          ? new FakeWeatherProvider()
          : new OpenMeteoClient({ apiKey: process.env['OPEN_METEO_API_KEY'] || undefined }),
      queue: createQueue(),
      push:
        process.env['PUSH_PROVIDER'] === 'expo'
          ? new ExpoPushClient({ accessToken: process.env['EXPO_ACCESS_TOKEN'] || undefined })
          : new FakePushClient(),
    }),
  );
  // PDF yükleme base64 geldiğinden gövde sınırı varsayılandan (100 kb) yüksek.
  app.useBodyParser('json', { limit: '30mb' });
  // Kimlik doğrulama çerezle değil Bearer jetonla olduğundan CORS CSRF riski doğurmaz; üretimde CORS_ORIGINS ile daraltılır.
  app.enableCors({ origin: process.env['CORS_ORIGINS']?.split(',') ?? true });
  await app.listen(Number(process.env['PORT'] ?? 3000));
  // Fiyat toplayıcıları: boşsa kapalı. Kaynak başına tekrar çekim aralığı ve robots.txt yine uygulanır.
  const everyMin = Number(process.env['MARKET_COLLECT_INTERVAL_MIN']);
  if (everyMin > 0) {
    const collector = app.get(MarketCollector);
    setInterval(
      () => void collector.runAll().catch((e) => console.error('pazar toplayıcı', e)),
      everyMin * 60_000,
    );
  }
}

void bootstrap();
