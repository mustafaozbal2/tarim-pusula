import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import {
  createSmsProvider,
  FakeSmsProvider,
  isRealSms,
  NetgsmSmsProvider,
  TwilioSmsProvider,
} from './auth/sms';
import { migrate } from './db/db';
import { createTestDb } from './db/testdb';
import { DEMO_CODE, DEMO_FARMER_PHONE, DEMO_PHONES, demoInfo } from './demo';

type Call = { url: string; init: RequestInit };
function recorder(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('SMS sağlayıcıları', () => {
  it('Netgsm: Basic kimlik, başlık, numara +90 olmadan, TR kodlama', async () => {
    const r = recorder(200, { code: '00', jobid: '1' });
    await new NetgsmSmsProvider({
      user: 'u',
      password: 'p',
      header: 'TARIMPUSULA',
      fetchImpl: r.fetchImpl,
    }).send('+905321234567', 'Tarım Pusula giriş kodunuz: 123456');
    expect(r.calls[0]!.url).toBe('https://api.netgsm.com.tr/sms/rest/v2/send');
    const h = r.calls[0]!.init.headers as Record<string, string>;
    expect(h['authorization']).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(JSON.parse(r.calls[0]!.init.body as string)).toEqual({
      msgheader: 'TARIMPUSULA',
      encoding: 'TR',
      messages: [{ msg: 'Tarım Pusula giriş kodunuz: 123456', no: '5321234567' }],
    });
  });

  it('Netgsm: "00" dışı kod hata fırlatır (kod gitmediyse kullanıcı bilsin)', async () => {
    const r = recorder(200, { code: '30', description: 'yetkisiz' });
    const p = new NetgsmSmsProvider({
      user: 'u',
      password: 'p',
      header: 'H',
      fetchImpl: r.fetchImpl,
    });
    await expect(p.send('+905321234567', 'x')).rejects.toThrow(/Netgsm/);
  });

  it('Twilio: form gövde, From ya da MessagingServiceSid', async () => {
    const r = recorder(201, { sid: 'SM1' });
    await new TwilioSmsProvider({
      sid: 'AC1',
      token: 't',
      from: '+15550001111',
      fetchImpl: r.fetchImpl,
    }).send('+905321234567', 'kod 123456');
    expect(r.calls[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
    const form = new URLSearchParams(r.calls[0]!.init.body as string);
    expect(form.get('To')).toBe('+905321234567');
    expect(form.get('From')).toBe('+15550001111');

    const r2 = recorder(201, {});
    await new TwilioSmsProvider({
      sid: 'AC1',
      token: 't',
      from: 'MG9',
      fetchImpl: r2.fetchImpl,
    }).send('+905321234567', 'x');
    expect(new URLSearchParams(r2.calls[0]!.init.body as string).get('MessagingServiceSid')).toBe(
      'MG9',
    );

    const bad = recorder(400, { code: 21211 });
    await expect(
      new TwilioSmsProvider({ sid: 'AC1', token: 't', from: '+1', fetchImpl: bad.fetchImpl }).send(
        '+90',
        'x',
      ),
    ).rejects.toThrow(/Twilio/);
  });

  it('ortamdan seçim: ayar eksikse sahte (kural 5)', () => {
    expect(isRealSms(createSmsProvider({}))).toBe(false);
    expect(isRealSms(createSmsProvider({ SMS_PROVIDER: 'netgsm', NETGSM_USER: 'u' }))).toBe(false);
    expect(
      createSmsProvider({
        SMS_PROVIDER: 'netgsm',
        NETGSM_USER: 'u',
        NETGSM_PASSWORD: 'p',
        NETGSM_HEADER: 'H',
      }),
    ).toBeInstanceOf(NetgsmSmsProvider);
    expect(
      createSmsProvider({
        SMS_PROVIDER: 'twilio',
        TWILIO_ACCOUNT_SID: 'AC',
        TWILIO_AUTH_TOKEN: 't',
        TWILIO_FROM: '+1',
      }),
    ).toBeInstanceOf(TwilioSmsProvider);
  });
});

describe('gerçek SMS açıkken demo kodu yalnız demo numaralarında', () => {
  const db = createTestDb();
  // "Gerçek" sağlayıcı gibi davranan kayıtçı: FakeSmsProvider değil.
  const sent: { phone: string; text: string }[] = [];
  const realLike = { send: async (phone: string, text: string) => void sent.push({ phone, text }) };
  let app: INestApplication;
  let base: string;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.status;
  };

  beforeAll(async () => {
    await migrate(db);
    const info = demoInfo({ DEMO_MODE: '1' })!;
    expect(isRealSms(realLike)).toBe(true);
    app = await NestFactory.create(
      AppModule.register({
        db,
        sms: realLike,
        demo: { ...info, codeOnlyFor: DEMO_PHONES },
        auth: { otpSecret: 'test' },
      }),
      { logger: false },
    );
    await app.listen(0);
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });

  it('demo numarası: SMS gönderilmez, sabit kod geçer, istek sınırı yok', async () => {
    for (let i = 0; i < 7; i++) {
      expect(await post('/auth/otp/request', { phone: DEMO_FARMER_PHONE })).toBe(200);
    }
    expect(sent.filter((s) => s.phone === DEMO_FARMER_PHONE)).toHaveLength(0);
    expect(await post('/auth/otp/verify', { phone: DEMO_FARMER_PHONE, code: DEMO_CODE })).toBe(200);
  });

  it('gerçek numara: rastgele kod SMS ile gider, sabit kod geçmez, 5 istekten sonra 429', async () => {
    const phone = '+905329998877';
    expect(await post('/auth/otp/request', { phone })).toBe(200);
    const msg = sent.find((s) => s.phone === phone)!;
    const code = msg.text.match(/\d{6}/)![0];
    if (code !== DEMO_CODE) {
      expect(await post('/auth/otp/verify', { phone, code: DEMO_CODE })).toBe(401);
    }
    expect(await post('/auth/otp/verify', { phone, code })).toBe(200);
    for (let i = 0; i < 4; i++) expect(await post('/auth/otp/request', { phone })).toBe(200);
    expect(await post('/auth/otp/request', { phone })).toBe(429);
  });

  it('sahte SMS ile (codeOnlyFor yok) eski davranış: sabit kod herkese', () => {
    expect(isRealSms(new FakeSmsProvider())).toBe(false);
  });
});
