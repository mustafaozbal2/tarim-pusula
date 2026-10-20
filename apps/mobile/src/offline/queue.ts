import type { FieldCreate, FieldUpdate } from '@tarim/schemas';
import { ApiError, NetworkError, type Api } from '../api/client';
import type { KV } from './kv';

/** Çevrimdışıyken yazılan işler sıraya girer; bağlantı gelince sırayla gönderilir. */
export type QueueItem =
  | { id: string; kind: 'field'; payload: FieldCreate; queuedAt: string }
  | { id: string; kind: 'claim'; code: string; payload: FieldCreate; queuedAt: string }
  /** Tarla düzeltmesi (ürün, sınır, ad). PATCH aynı yamayla tekrarlanınca aynı sonucu verir. */
  | { id: string; kind: 'field-update'; fieldId: string; patch: FieldUpdate; queuedAt: string };

export type Outcome =
  | { id: string; result: 'sent' }
  /** Sunucu kalıcı olarak reddetti (ör. yanlış kod); sıradan çıkarıldı. */
  | { id: string; result: 'rejected'; status: number; message: string }
  /** Bağlantı yok; sırada kaldı. */
  | { id: string; result: 'offline' };

const KEY = 'queue.v1';

export class OfflineQueue {
  private running: Promise<Outcome[]> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly kv: KV,
    private readonly api: Pick<Api, 'createField' | 'nearbyClaim'> &
      Partial<Pick<Api, 'updateField'>>,
  ) {}

  /** Sıradan en az bir iş çıktığında (gönderildi ya da reddedildi) haber verir. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async pending(): Promise<QueueItem[]> {
    const raw = await this.kv.get(KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  }

  private save(items: QueueItem[]) {
    return this.kv.set(KEY, JSON.stringify(items));
  }

  /** Aynı kimlikle ikinci kez eklenirse yok sayılır (çift dokunma). */
  async enqueue(item: QueueItem): Promise<void> {
    const items = await this.pending();
    if (items.some((i) => i.id === item.id)) return;
    await this.save([...items, item]);
  }

  /**
   * Sırayı baştan gönderir. İlk bağlantı hatasında durur (sıra bozulmasın, pil harcanmasın).
   * Aynı anda tek çalışma: ikinci çağrı çalışanın sonucunu bekler.
   */
  flush(): Promise<Outcome[]> {
    this.running ??= this.run()
      .then((out) => {
        if (out.some((o) => o.result !== 'offline')) this.listeners.forEach((l) => l());
        return out;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async run(): Promise<Outcome[]> {
    const outcomes: Outcome[] = [];
    for (const item of await this.pending()) {
      try {
        if (item.kind === 'field')
          await this.api.createField({ ...item.payload, clientId: item.id });
        else if (item.kind === 'field-update') {
          if (!this.api.updateField) throw new Error('updateField yok');
          await this.api.updateField(item.fieldId, item.patch);
        } else await this.api.nearbyClaim(item.code, item.payload);
        await this.remove(item.id);
        outcomes.push({ id: item.id, result: 'sent' });
      } catch (e) {
        if (e instanceof NetworkError) {
          outcomes.push({ id: item.id, result: 'offline' });
          break;
        }
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408) {
          await this.remove(item.id);
          outcomes.push({ id: item.id, result: 'rejected', status: e.status, message: e.message });
          continue;
        }
        // 5xx / bilinmeyen hata: geçici say, sırada tut.
        outcomes.push({ id: item.id, result: 'offline' });
        break;
      }
    }
    return outcomes;
  }

  private async remove(id: string) {
    await this.save((await this.pending()).filter((i) => i.id !== id));
  }
}
