import { KIND_METHODS, type DeviceRegister } from '@tarim/schemas';
import { normalizePairingCode } from './adapters';

export type ValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Cihaz kaydı için tür ve bağlantı yöntemi uyumu. Eşleştirme kodu yöntemi kod ister; diğerleri istemez.
 * Sahiplik (arazi kullanıcıya mı ait?) burada DEĞİL, sunucuda veri tabanı yetkisiyle doğrulanır.
 */
export function validateRegistration(r: DeviceRegister): ValidationResult {
  if (!KIND_METHODS[r.kind].includes(r.method)) {
    return { ok: false, message: 'Bu cihaz türü için seçilen bağlantı yöntemi desteklenmiyor' };
  }
  if (r.method === 'eslestirme-kodu') {
    const code = normalizePairingCode(r.pairingCode ?? '');
    if (!/^[A-Z0-9-]{6,32}$/.test(code)) {
      return { ok: false, message: 'Eşleştirme kodu 6-32 harf/rakam olmalı' };
    }
  }
  return { ok: true };
}
