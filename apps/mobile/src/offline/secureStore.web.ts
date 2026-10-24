import { kv } from './kvStore';

/**
 * Web'de güvenli donanım deposu yoktur; localStorage kullanılır (aynı kaynak kuralıyla korunur,
 * jeton ömrü sunucuda sınırlıdır). Cihaz sürümü için bkz. secureStore.ts.
 */
export const secure = kv;
