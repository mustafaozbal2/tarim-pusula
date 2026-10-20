import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
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
  const app = await NestFactory.create(AppModule.register({ db, sms: createSmsProvider() }));
  // Kimlik doğrulama çerezle değil Bearer jetonla olduğundan CORS CSRF riski doğurmaz; üretimde CORS_ORIGINS ile daraltılır.
  app.enableCors({ origin: process.env['CORS_ORIGINS']?.split(',') ?? true });
  await app.listen(Number(process.env['PORT'] ?? 3000));
}

void bootstrap();
