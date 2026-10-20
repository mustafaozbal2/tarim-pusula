import { useSyncExternalStore } from 'react';
import { createApi } from './api/client';
import { kv } from './offline/kvStore';
import { OfflineQueue } from './offline/queue';

const TOKEN_KEY = 'session.token';
const API_URL_KEY = 'config.apiUrl';
/** Android emülatöründe ana makine 10.0.2.2'dir; gerçek cihazda EXPO_PUBLIC_API_URL verilir. */
const DEFAULT_API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

let token: string | null = null;
let loaded: Promise<void> | null = null;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Depodaki jetonu bir kez yükler. */
export function loadSession(): Promise<void> {
  loaded ??= kv.get(TOKEN_KEY).then((t) => {
    token = t;
    ready = true;
    emit();
  });
  return loaded;
}

export async function setToken(next: string | null): Promise<void> {
  token = next;
  if (next) await kv.set(TOKEN_KEY, next);
  else await kv.remove(TOKEN_KEY);
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

export const api = createApi({
  // Adres depodan okunabilir (test ve saha kurulumu için); yoksa varsayılan.
  baseUrl: async () => (await kv.get(API_URL_KEY)) ?? DEFAULT_API_URL,
  getToken: async () => {
    await loadSession();
    return token;
  },
});

export const queue = new OfflineQueue(kv, api);
