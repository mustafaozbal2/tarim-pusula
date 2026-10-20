import 'reflect-metadata';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../api/src/app.module';
import { FakeSmsProvider } from '../api/src/auth/sms';
import { importCropCatalog } from '../api/src/crops';
import { migrate, PgliteDb } from '../api/src/db/db';

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
  await importCropCatalog(db);
  const app = await NestFactory.create(
    AppModule.register({ db, sms, auth: { otpSecret: 'e2e' } }),
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
      if (url.pathname === '/__e2e/user') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ api: `http://127.0.0.1:${API_PORT}`, ...(await newUser()) }));
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
