import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { PgliteDb, migrate } from './db/db';
import { Places } from './places';
import { jetonGecerli, jetonUret, maskele } from './yonetim';

const db = new PgliteDb();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let base = '';

beforeAll(async () => {
  await migrate(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms: new FakeSmsProvider(),
      auth: { otpSecret: 't' },
      places: Places.load(),
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
}, 120_000);
afterAll(async () => app?.close());

const post = (p: string, b: unknown) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  });

describe('yönetim paneli', () => {
  it('telefon maskelenir; jeton imzalı ve süreli', () => {
    expect(maskele('+905321234567')).toBe('+90 532 *** ** 67');
    expect(maskele(null)).toBe('—');
    const j = jetonUret('admin', 1000);
    expect(jetonGecerli(j, 2000)).toBe(true);
    expect(jetonGecerli(j, 1000 + 9 * 3_600_000)).toBe(false);
    expect(jetonGecerli(j.slice(0, -2) + 'xx', 2000)).toBe(false);
    expect(jetonGecerli(undefined)).toBe(false);
  });
  it('giriş doğrulanır; yanlış şifre 401; jetonsuz veri 401; jetonla veri gelir', async () => {
    expect((await post('/yonetim/giris', { kullanici: 'admin', sifre: 'yanlis' })).status).toBe(
      401,
    );
    expect((await fetch(base + '/yonetim/ozet')).status).toBe(401);
    const g = await post('/yonetim/giris', { kullanici: 'admin', sifre: '12345-6' });
    expect(g.status).toBe(200);
    const { jeton } = (await g.json()) as { jeton: string };
    const o = await fetch(base + '/yonetim/ozet', { headers: { 'x-yonetim': jeton } });
    expect(o.status).toBe(200);
    const j = (await o.json()) as { sayac: Record<string, number>; gunluk: unknown[] };
    expect(j.sayac.kullanici).toBe(0);
    expect(j.gunluk).toHaveLength(14);
    for (const b of [
      'kullanicilar',
      'araziler',
      'haberler',
      'kaynaklar',
      'sorular',
      'bildirimler',
      'cihazlar',
      'fiyatlar',
      'denetim',
    ]) {
      const r = await fetch(`${base}/yonetim/liste/${b}`, { headers: { 'x-yonetim': jeton } });
      expect(r.status, b).toBe(200);
      expect(Array.isArray(await r.json()), b).toBe(true);
    }
    expect(
      (await fetch(`${base}/yonetim/liste/bilinmez`, { headers: { 'x-yonetim': jeton } })).status,
    ).toBe(400);
  }, 60_000);
});
