import * as SecureStore from 'expo-secure-store';
import type { KV } from './kv';

/**
 * Cihazın güvenli deposu (iOS Anahtar Zinciri / Android Keystore). Oturum jetonu burada durur;
 * düz SQLite'ta durmaz. Yalnızca bu cihazda, cihaz kilidi açıkken okunabilir.
 */
class SecureKV implements KV {
  get(key: string) {
    return SecureStore.getItemAsync(key);
  }
  async set(key: string, value: string) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  async remove(key: string) {
    await SecureStore.deleteItemAsync(key);
  }
}

export const secure: KV = new SecureKV();
