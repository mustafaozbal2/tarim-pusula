/**
 * Uygulama içinden APK güncellemesi (MP-6): APK uygulamanın içinde indirilir ve doğrudan Android kurucusu
 * açılır; kullanıcı tarayıcıya, indirilenler klasörüne ya da "yine de indir" uyarısına gitmez. Android
 * "bu kaynaktan kuruluma izin ver" ekranını yalnız İLK güncellemede gösterir (izin bir kez verilince
 * sonraki güncellemelerde yalnız "Güncelle" onayı çıkar; bunu sistem ister, uygulama atlayamaz).
 * Her adım başarısız olursa çağıran bağlantıyı tarayıcıda açar (eski yol).
 */
export interface ApkKurucu {
  indir(adres: string, ilerleme: (oran: number) => void): Promise<string>;
  icerikAdresi(dosya: string): Promise<string>;
  kurucuyuAc(icerikAdresi: string): Promise<void>;
}

export type KurSonuc = 'kurucu-acildi' | 'hata';

export async function apkKur(
  adres: string,
  k: ApkKurucu,
  ilerleme: (oran: number) => void = () => undefined,
): Promise<KurSonuc> {
  if (!/^https:\/\/[^\s]+\.apk(\?[^\s]*)?$/i.test(adres)) return 'hata';
  try {
    const dosya = await k.indir(adres, ilerleme);
    await k.kurucuyuAc(await k.icerikAdresi(dosya));
    return 'kurucu-acildi';
  } catch {
    return 'hata';
  }
}

/** Gerçek kurucu (yalnız Android). expo-file-system ve expo-intent-launcher gerektiğinde yüklenir. */
export function gercekKurucu(): ApkKurucu {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const FS = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const IL = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    async indir(adres, ilerleme) {
      const hedef = `${FS.cacheDirectory}tarim-pusula-guncelleme.apk`;
      await FS.deleteAsync(hedef, { idempotent: true });
      const d = FS.createDownloadResumable(adres, hedef, {}, (p) => {
        if (p.totalBytesExpectedToWrite > 0) {
          ilerleme(p.totalBytesWritten / p.totalBytesExpectedToWrite);
        }
      });
      const r = await d.downloadAsync();
      if (!r || r.status !== 200) throw new Error('indirilemedi');
      return r.uri;
    },
    icerikAdresi: (dosya) => FS.getContentUriAsync(dosya),
    async kurucuyuAc(icerikAdresi) {
      await IL.startActivityAsync('android.intent.action.VIEW', {
        data: icerikAdresi,
        type: 'application/vnd.android.package-archive',
        flags: 1 | 268435456, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
      });
    },
  };
}
