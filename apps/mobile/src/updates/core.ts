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

/** Açılışta denetim en çok bu kadar bekler; ağ yoksa/yavaşsa uygulama engellenmeden açılır. */
export const START_CHECK_MS = 8_000;

const timeout = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export type StartCheck = 'kapali' | 'guncel' | 'var' | 'hata';

/**
 * Soğuk açılışta: yeni sürüm VAR mı? (İndirmez.) Varsa arayüz "Güncelle" ekranıyla uygulamayı kilitler.
 * Ağ hatası ve zaman aşımı 'hata' döner: bağlantısız çiftçi uygulamaya yine girer.
 */
export async function checkAtStart(u: UpdatesApi, ms = START_CHECK_MS): Promise<StartCheck> {
  if (!u.enabled) return 'kapali';
  try {
    const c = await Promise.race([u.check(), timeout<null>(ms, null)]);
    if (c === null) return 'hata';
    return c.isAvailable ? 'var' : 'guncel';
  } catch {
    return 'hata';
  }
}

/** "Güncelle" düğmesi: indir ve yeniden aç. İndirilemezse 'hata' (ekran kilitli kalır, tekrar denenir). */
export async function applyUpdate(u: UpdatesApi): Promise<'yeniden-aciliyor' | 'guncel' | 'hata'> {
  try {
    const f = await u.fetch();
    if (!f.isNew) return 'guncel';
    await u.reload();
    return 'yeniden-aciliyor';
  } catch {
    return 'hata';
  }
}

/** Uygulama öne gelince sessizce indirir (yeniden açmaz; form ortasında veri kaybolmasın). Sonraki açılışta hazırdır. */
export async function prefetchUpdate(u: UpdatesApi): Promise<void> {
  if (!u.enabled) return;
  try {
    if ((await u.check()).isAvailable) await u.fetch();
  } catch {
    // Ağ yok: sonra tekrar denenir.
  }
}

/** "0.1.0" biçimli sürümleri karşılaştırır: a<b → -1, a=b → 0, a>b → 1. Bozuk biçim 0 sayılır. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const n = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Sitedeki surum.json: yerel kod (APK) değişince yüklü APK bu sürümün altındaysa uygulama yeni APK ister. */
export interface ApkManifest {
  enAz: string;
  son: string;
  adres: string;
}

export type ApkCheck = { kind: 'tamam' } | { kind: 'zorunlu'; son: string; adres: string };

/** Yüklü APK en az sürümün altındaysa 'zorunlu'. Dosya okunamazsa (ağ yok, bozuk) 'tamam': giriş engellenmez. */
export async function checkApk(
  installed: string,
  load: () => Promise<ApkManifest>,
  ms = START_CHECK_MS,
): Promise<ApkCheck> {
  try {
    const m = await Promise.race([load(), timeout<null>(ms, null)]);
    if (!m || typeof m.enAz !== 'string' || typeof m.adres !== 'string') return { kind: 'tamam' };
    if (!/^https:\/\//.test(m.adres)) return { kind: 'tamam' };
    return compareVersions(installed, m.enAz) < 0
      ? { kind: 'zorunlu', son: m.son ?? m.enAz, adres: m.adres }
      : { kind: 'tamam' };
  } catch {
    return { kind: 'tamam' };
  }
}
