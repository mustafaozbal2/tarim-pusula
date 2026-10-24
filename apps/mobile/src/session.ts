import { useSyncExternalStore } from 'react';
import { createApi, NetworkError } from './api/client';
import { resolveApiUrl } from './config';
import { kv } from './offline/kvStore';
import { secure } from './offline/secureStore';
import { createTokenStore } from './offline/tokenStore';
import { OfflineQueue } from './offline/queue';

const TOKEN_KEY = 'session.token';
const API_URL_KEY = 'config.apiUrl';
/** Gerçek cihazda EXPO_PUBLIC_API_URL (derleme zamanı) ya da Ayarlar'dan yazılan adres kullanılır. */
const ENV_API_URL = process.env['EXPO_PUBLIC_API_URL'];

// Jeton cihazın güvenli deposunda; ayarlar ve önbellek düz depoda (kv).
const tokenStore = createTokenStore(secure, kv, TOKEN_KEY);

let token: string | null = null;
let loaded: Promise<void> | null = null;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Depodaki jetonu bir kez yükler. */
export function loadSession(): Promise<void> {
  loaded ??= tokenStore.get().then((t) => {
    token = t;
    ready = true;
    emit();
  });
  return loaded;
}

export async function setToken(next: string | null): Promise<void> {
  token = next;
  if (next) await tokenStore.set(next);
  else await tokenStore.clear();
  emit();
}

/** Oturum yüklenene kadar `undefined`, giriş yoksa `null`. */
export function useToken(): string | null | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void loadSession();
      return () => listeners.delete(l);
    },
    () => (ready ? token : undefined),
    () => undefined,
  );
}

/** Etkin sunucu adresi; hiç ayarlanmadıysa `null`. */
export async function currentApiUrl(): Promise<string | null> {
  return resolveApiUrl(await kv.get(API_URL_KEY), ENV_API_URL);
}

export async function saveApiUrl(url: string): Promise<void> {
  await kv.set(API_URL_KEY, url.trim());
}

export const api = createApi({
  // Adres depodan okunabilir (test ve saha kurulumu için); yoksa varsayılan.
  baseUrl: async () => {
    const url = await currentApiUrl();
    if (!url) throw new NetworkError(); // adres yok: çökmeden "Sunucuya bağlanılamadı"
    return url;
  },
  getToken: async () => {
    await loadSession();
    return token;
  },
});

export const queue = new OfflineQueue(kv, api);
