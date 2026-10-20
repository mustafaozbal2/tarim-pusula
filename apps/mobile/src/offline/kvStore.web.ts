import type { KV } from './kv';

/** Web deposu: localStorage (expo-sqlite web desteği deneysel olduğundan kullanılmıyor). */
class LocalStorageKV implements KV {
  async get(key: string) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  async set(key: string, value: string) {
    globalThis.localStorage?.setItem(key, value);
  }
  async remove(key: string) {
    globalThis.localStorage?.removeItem(key);
  }
}

export const kv: KV = new LocalStorageKV();
