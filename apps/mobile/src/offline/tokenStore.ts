import type { KV } from './kv';

/**
 * Oturum jetonu deposu. Jeton `secure` depoda durur. Eski sürümde düz depoya (`legacy`) yazılmış
 * jeton ilk okumada güvenli depoya taşınır ve düz depodan silinir.
 */
export function createTokenStore(secure: KV, legacy: KV, key: string) {
  return {
    async get(): Promise<string | null> {
      const cur = await secure.get(key);
      if (cur) return cur;
      if (secure === legacy) return null;
      const old = await legacy.get(key);
      if (!old) return null;
      await secure.set(key, old);
      await legacy.remove(key);
      return old;
    },
    async set(token: string): Promise<void> {
      await secure.set(key, token);
      if (secure !== legacy) await legacy.remove(key);
    },
    async clear(): Promise<void> {
      await secure.remove(key);
      if (secure !== legacy) await legacy.remove(key);
    },
  };
}
