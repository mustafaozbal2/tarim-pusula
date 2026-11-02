/**
 * Uygulama içi güncelleme (EAS Update). Yeni sürüm yayınlanınca telefon kendisi indirir ve hemen
 * yeniden açılır; çiftçinin uygulamayı iki kez kapatıp açması gerekmez. expo-updates burada
 * arayüzle verilir ki karar mantığı cihazsız sınansın.
 */
export interface UpdatesApi {
  enabled: boolean;
  check(): Promise<{ isAvailable: boolean }>;
  fetch(): Promise<{ isNew: boolean }>;
  reload(): Promise<void>;
}

export type UpdateResult = 'kapali' | 'guncel' | 'yeniden-aciliyor' | 'hata';

/** Uygulama öne gelince en sık bu aralıkla denetlenir (sunucuya gereksiz istek gitmesin). */
export const RESUME_CHECK_MS = 60_000;

export function shouldCheckOnResume(lastCheck: number | null, now: number): boolean {
  return lastCheck === null || now - lastCheck >= RESUME_CHECK_MS;
}

/** Denetle → varsa indir → yeni ise yeniden aç. Ağ hatası uygulamayı bozmaz ('hata' döner). */
export async function syncUpdate(u: UpdatesApi): Promise<UpdateResult> {
  if (!u.enabled) return 'kapali';
  try {
    const c = await u.check();
    if (!c.isAvailable) return 'guncel';
    const f = await u.fetch();
    if (!f.isNew) return 'guncel';
    await u.reload();
    return 'yeniden-aciliyor';
  } catch {
    return 'hata';
  }
}
