import 'reflect-metadata';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { PgliteDb, migrate } from './db/db';
import { DEMO_QUESTIONS, demoInfo } from './demo';
import { demoSampleWeather, startDemo, type DemoHandle } from './demo-server';

describe('demoInfo: demo kodu yalnız DEMO_MODE=1 iken', () => {
  it('ortam değişkeni yoksa kapalı', () => {
    expect(demoInfo({})).toBeUndefined();
    expect(demoInfo({ DEMO_MODE: '0' })).toBeUndefined();
    expect(demoInfo({ DEMO_MODE: 'true' })).toBeUndefined();
  });
  it('DEMO_MODE=1 ile açık', () => {
    expect(demoInfo({ DEMO_MODE: '1' })?.code).toBe('123456');
  });
  it('üretimde DEMO_MODE=1 olsa bile asla açılmaz', () => {
    expect(demoInfo({ DEMO_MODE: '1', NODE_ENV: 'production' })).toBeUndefined();
  });
});

describe('demo kapalıyken', () => {
  it('/demo/info yoktur ve 123456 giriş kodu olarak geçmez', async () => {
    const db = new PgliteDb();
    await migrate(db);
    const sms = new FakeSmsProvider();
    const app = await NestFactory.create(AppModule.register({ db, sms }), { logger: false });
    await app.listen(18230);
    try {
      expect((await fetch('http://127.0.0.1:18230/demo/info')).status).toBe(404);
      const h = { 'content-type': 'application/json' };
      const phone = '+905320000099';
      await fetch('http://127.0.0.1:18230/auth/otp/request', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ phone }),
      });
      // Rastgele kod 123456 çıkmadıkça sabit kod reddedilir (olasılık 1/10^6; gerçek kodla karşılaştır).
      if (sms.lastCode(phone) !== '123456') {
        const r = await fetch('http://127.0.0.1:18230/auth/otp/verify', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ phone, code: '123456' }),
        });
        expect(r.status).toBe(401);
      }
    } finally {
      await app.close();
    }
  }, 60_000);
});

describe('demo sunucusu', () => {
  let h: DemoHandle;
  const API = 18210;
  const WEB = 18200;
  const api = (p: string, init?: RequestInit) => fetch(`http://127.0.0.1:${API}${p}`, init);
  const auth = (token: string) => ({
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  });
  let token = '';
  let fieldId = '';

  beforeAll(async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const dir = mkdtempSync(join(tmpdir(), 'demo-web-'));
    writeFileSync(join(dir, 'index.html'), '<html>demo</html>');
    // Testler ağsız: hava örnek veriden (gerçek Open-Meteo çağrılmaz).
    h = await startDemo({ apiPort: API, webPort: WEB, webDir: dir, weather: demoSampleWeather() });
    const phone = '+905320000001';
    const json = { 'content-type': 'application/json' };
    await api('/auth/otp/request', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ phone }),
    });
    const r = await api('/auth/otp/verify', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ phone, code: '123456' }),
    });
    token = ((await r.json()) as { token: string }).token;
    const fields = (await (await api('/fields', { headers: auth(token) })).json()) as {
      id: string;
      name: string;
    }[];
    fieldId = fields.find((f) => f.name.startsWith('Burç'))!.id;
  }, 120_000);
  afterAll(async () => {
    await h?.close();
    vi.unstubAllEnvs();
  });

  it('iki adres de sağlık ucuna 200 döner', async () => {
    expect((await api('/health')).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${WEB}/health`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${WEB}/`)).status).toBe(200);
  });
  it('/demo/info demo kodunu verir', async () => {
    const r = await api('/demo/info');
    expect(r.status).toBe(200);
    expect(((await r.json()) as { code: string }).code).toBe('123456');
  });
  it('2 örnek tarla ve sanal cihaz var', async () => {
    const fields = (await (await api('/fields', { headers: auth(token) })).json()) as {
      name: string;
    }[];
    expect(fields.map((f) => f.name).sort()).toEqual([
      'Burç Köyü Antep fıstığı',
      'Yayla zeytinliği',
    ]);
    const devs = (await (await api('/devices', { headers: auth(token) })).json()) as unknown[];
    expect(devs.length).toBe(1);
  });
  it('Bugün: güncel tarihli don uyarısı, duyuru ve takvim', async () => {
    const today = await (await api(`/fields/${fieldId}/today`, { headers: auth(token) })).json();
    expect(JSON.stringify(today)).toMatch(/frost/i);
    const ann = (await (
      await api(`/fields/${fieldId}/announcements`, { headers: auth(token) })
    ).json()) as { announcements: unknown[] };
    expect(ann.announcements.length).toBeGreaterThan(0);
  });
  it('Pazar: örnek fiyat var', async () => {
    const r = await api('/market/crops', { headers: auth(token) });
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).toMatch(/Antep/);
  });
  it.each(DEMO_QUESTIONS)('Pusula AI hazır cevap verir: %s', async (question) => {
    const r = await api('/pusula/ask', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ question, fieldId }),
    });
    expect(r.status).toBeLessThan(300);
    const { card } = (await r.json()) as {
      card: { kind: string; steps: string[]; sources: { title: string }[] };
    };
    expect(card.kind).toBe('answer');
    expect(card.steps.length).toBeGreaterThan(0);
    expect(card.sources.length).toBeGreaterThan(0);
  });
  it('ilaç dozu sorusuna doz verilmez', async () => {
    const r = await api('/pusula/ask', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ question: 'İlaç dozu ne kadar olmalı?', fieldId }),
    });
    const { card } = (await r.json()) as { card: { kind: string; steps: string[] } };
    expect(card.kind).not.toBe('answer');
    expect(card.steps.join(' ')).not.toMatch(/\d\s*(ml|gr?|kg|litre|lt|%)/i);
  });
  it('panel demo hesabı: SMS ve doğrulayıcı adımı sabit kodla geçilir', async () => {
    const phone = '+905320000002';
    const json = { 'content-type': 'application/json' };
    await api('/auth/otp/request', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ phone }),
    });
    const v = (await (
      await api('/auth/otp/verify', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ phone, code: '123456' }),
      })
    ).json()) as { token: string };
    expect(
      (await api('/panel/mfa/enroll', { method: 'POST', headers: auth(v.token) })).status,
    ).toBe(200);
    const ok = await api('/panel/mfa/verify', {
      method: 'POST',
      headers: auth(v.token),
      body: JSON.stringify({ code: '123456' }),
    });
    expect(ok.status).toBeLessThan(300);
    const st = (await (await api('/panel/mfa', { headers: auth(v.token) })).json()) as {
      verified: boolean;
    };
    expect(st.verified).toBe(true);
  });
});
