export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

/**
 * Sahte sağlayıcı (değişmez kural 5): gerçek SMS anahtarı yokken çalışır, testler bunun
 * `sent` listesinden kodu okur. Üretimde kod günlüğe yazılmaz.
 */
export class FakeSmsProvider implements SmsProvider {
  readonly sent: { phone: string; text: string }[] = [];

  async send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text });
    if (process.env['NODE_ENV'] !== 'production') {
      console.log(`[sahte-sms] ${phone}: ${text}`);
    }
  }

  /** Son gönderilen mesajdaki 6 haneli kod. */
  lastCode(phone: string): string {
    const msg = [...this.sent].reverse().find((m) => m.phone === phone);
    const code = msg?.text.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`Bu numaraya kod gönderilmedi: ${phone}`);
    return code;
  }
}

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

/**
 * Netgsm (Türkiye) REST v2 tekli gönderim: POST /sms/rest/v2/send, Basic kimlik, JSON gövde.
 * Başarılı yanıt `{"code":"00","jobid":...}`; başka her kod hatadır. Numara 5XXXXXXXXX biçiminde
 * gider. `msgheader`, Netgsm panelinde onaylı gönderici başlığıdır.
 */
export class NetgsmSmsProvider implements SmsProvider {
  constructor(
    private readonly o: {
      user: string;
      password: string;
      header: string;
      fetchImpl?: typeof fetch;
      url?: string;
    },
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const res = await (this.o.fetchImpl ?? fetch)(
      this.o.url ?? 'https://api.netgsm.com.tr/sms/rest/v2/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: basic(this.o.user, this.o.password),
        },
        body: JSON.stringify({
          msgheader: this.o.header,
          encoding: 'TR',
          messages: [{ msg: text, no: phone.replace(/^\+90/, '') }],
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as { code?: string; description?: string };
    if (!res.ok || body.code !== '00') {
      throw new Error(`Netgsm SMS gönderilemedi: ${res.status} ${body.code ?? ''}`);
    }
  }
}

/**
 * Twilio Messages API: POST /2010-04-01/Accounts/{sid}/Messages.json, form gövde. Gönderen ya bir
 * Twilio numarası (`from`) ya da Messaging Service (`MG...`) kimliğidir. 2xx dışı yanıt hatadır.
 */
export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly o: { sid: string; token: string; from: string; fetchImpl?: typeof fetch },
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const form = new URLSearchParams({ To: phone, Body: text });
    form.set(this.o.from.startsWith('MG') ? 'MessagingServiceSid' : 'From', this.o.from);
    const res = await (this.o.fetchImpl ?? fetch)(
      `https://api.twilio.com/2010-04-01/Accounts/${this.o.sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: basic(this.o.sid, this.o.token),
        },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: number };
      throw new Error(`Twilio SMS gönderilemedi: ${res.status} ${body.code ?? ''}`);
    }
  }
}

/**
 * SMS Gateway for Android (açık kaynak, https://sms-gate.app): SMS, uygulamanın kurulu olduğu
 * telefonun kendi hattından gider (tarifedeki SMS hakkı; ek ücret yok). Bulut modu:
 * POST {base}/3rdparty/v1/messages, Basic kimlik (uygulamanın verdiği kullanıcı/şifre).
 */
export class SmsGateProvider implements SmsProvider {
  constructor(
    private readonly o: { user: string; password: string; url?: string; fetchImpl?: typeof fetch },
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const base = (this.o.url ?? 'https://api.sms-gate.app').replace(/\/$/, '');
    const res = await (this.o.fetchImpl ?? fetch)(`${base}/3rdparty/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: basic(this.o.user, this.o.password),
      },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [phone] }),
    });
    if (!res.ok) throw new Error(`SMS Gateway gönderemedi: ${res.status}`);
  }
}

/**
 * Ortamdan sağlayıcı seçer: SMS_PROVIDER=netgsm (NETGSM_USER, NETGSM_PASSWORD, NETGSM_HEADER) ya da
 * twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM) ya da smsgate (SMSGATE_USER,
 * SMSGATE_PASSWORD, isteğe bağlı SMSGATE_URL). Ayar eksikse sahteye düşer.
 */
export function createSmsProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): SmsProvider {
  const p = env['SMS_PROVIDER'];
  if (p === 'netgsm' && env['NETGSM_USER'] && env['NETGSM_PASSWORD'] && env['NETGSM_HEADER']) {
    return new NetgsmSmsProvider({
      user: env['NETGSM_USER'],
      password: env['NETGSM_PASSWORD'],
      header: env['NETGSM_HEADER'],
      fetchImpl,
    });
  }
  if (
    p === 'twilio' &&
    env['TWILIO_ACCOUNT_SID'] &&
    env['TWILIO_AUTH_TOKEN'] &&
    env['TWILIO_FROM']
  ) {
    return new TwilioSmsProvider({
      sid: env['TWILIO_ACCOUNT_SID'],
      token: env['TWILIO_AUTH_TOKEN'],
      from: env['TWILIO_FROM'],
      fetchImpl,
    });
  }
  if (p === 'smsgate' && env['SMSGATE_USER'] && env['SMSGATE_PASSWORD']) {
    return new SmsGateProvider({
      user: env['SMSGATE_USER'],
      password: env['SMSGATE_PASSWORD'],
      url: env['SMSGATE_URL'] || undefined,
      fetchImpl,
    });
  }
  if (p && p !== 'fake') {
    console.warn(`SMS_PROVIDER=${p} için ayar eksik; sahte sağlayıcı kullanılıyor.`);
  }
  return new FakeSmsProvider();
}

/** Gerçek SMS gidiyor mu (sahte değil). */
export const isRealSms = (s: SmsProvider) => !(s instanceof FakeSmsProvider);
