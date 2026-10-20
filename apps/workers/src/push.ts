/** Expo Push (https://docs.expo.dev/push-notifications/sending-notifications/) istemcisi. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Don gibi acil mesajlar yüksek öncelikli gider. */
  priority?: 'default' | 'high';
}

export interface PushResult {
  token: string;
  ok: boolean;
  /** Cihaz kaydı geçersiz (uygulama silinmiş): belirteç silinmeli. */
  invalidToken: boolean;
  error?: string;
}

export interface PushClient {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export class ExpoPushClient implements PushClient {
  constructor(
    private readonly opts: { accessToken?: string; fetchImpl?: typeof fetch; url?: string } = {},
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const out: PushResult[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      let tickets: { status: string; message?: string; details?: { error?: string } }[] = [];
      let failure: string | undefined;
      try {
        const res = await doFetch(this.opts.url ?? EXPO_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.opts.accessToken ? { authorization: `Bearer ${this.opts.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk.map((m) => ({ sound: 'default', ...m }))),
        });
        if (!res.ok) failure = `HTTP ${res.status}`;
        else tickets = ((await res.json()) as { data?: typeof tickets }).data ?? [];
      } catch (e) {
        failure = String(e);
      }
      chunk.forEach((m, k) => {
        const t = tickets[k];
        if (failure || !t) {
          out.push({ token: m.to, ok: false, invalidToken: false, error: failure ?? 'yanıt yok' });
        } else if (t.status === 'ok') {
          out.push({ token: m.to, ok: true, invalidToken: false });
        } else {
          out.push({
            token: m.to,
            ok: false,
            invalidToken: t.details?.error === 'DeviceNotRegistered',
            error: t.message ?? t.details?.error,
          });
        }
      });
    }
    return out;
  }
}

/** Anahtar/ağ yokken (geliştirme, test): gönderilenleri kaydeder, hepsini başarılı sayar. */
export class FakePushClient implements PushClient {
  readonly sent: PushMessage[] = [];
  /** Bu belirteçler geçersiz sayılır. */
  invalid = new Set<string>();
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    return messages.map((m) => {
      if (this.invalid.has(m.to)) {
        return { token: m.to, ok: false, invalidToken: true, error: 'DeviceNotRegistered' };
      }
      this.sent.push(m);
      return { token: m.to, ok: true, invalidToken: false };
    });
  }
}
