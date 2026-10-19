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

export function createSmsProvider(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  // Gerçek sağlayıcılar ileride eklenir; yapılandırma yoksa sahteye düşülür.
  if (env['SMS_PROVIDER'] && env['SMS_PROVIDER'] !== 'fake') {
    console.warn(`SMS_PROVIDER=${env['SMS_PROVIDER']} henüz yok; sahte sağlayıcı kullanılıyor.`);
  }
  return new FakeSmsProvider();
}
