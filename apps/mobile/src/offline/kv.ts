/** Küçük anahtar-değer deposu. Cihazda SQLite (kvStore.ts), web'de localStorage (kvStore.web.ts). */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryKV implements KV {
  private readonly m = new Map<string, string>();
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.m.set(key, value);
  }
  async remove(key: string) {
    this.m.delete(key);
  }
}
