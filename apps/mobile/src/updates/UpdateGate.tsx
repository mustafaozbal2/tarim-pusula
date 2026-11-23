import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily } from '@tarim/ui';
import { IMAGE_FILES } from '../assets';
import { tr } from '../i18n/tr';
import { apkKur, gercekKurucu } from './apkKur';
import { PLAY_SURUMU } from './play';
import { checkApk, type ApkManifest, type UpdatesApi } from './core';
import { useAutoUpdate } from './index';

const t = tr.gate;
const SITE = process.env['EXPO_PUBLIC_SITE_URL'] ?? 'https://tarimpusula.onrender.com';

type Phase =
  | { k: 'open' }
  | { k: 'ready' }
  | { k: 'apk'; adres: string }
  | { k: 'apk-indiriyor'; adres: string; oran: number };

/** Sitedeki surum.json'u okur (yerel kod değişince yüklü APK'nın en az sürümünü bildirir). */
export const loadApkManifest = async (): Promise<ApkManifest> => {
  const r = await fetch(`${SITE}/surum.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as ApkManifest;
};

/**
 * Güncelleme kimseyi bekletmez: uygulama hemen açılır, yeni sürüm arka planda iner. İnince üstte küçük
 * "Yeni sürüm hazır" şeridi çıkar ("Yeniden başlat" ya da "Sonra"; dokunulmazsa sonraki açılışta zaten yeni
 * sürüm açılır). Yalnız yüklü APK çok eskiyse (yerel kod değişti) yeni APK indirme ekranı örter.
 */
export function UpdateGate({
  api,
  installed,
  apkLoader = loadApkManifest,
}: {
  api: UpdatesApi;
  installed: string;
  apkLoader?: () => Promise<ApkManifest>;
}) {
  const active = api.enabled && Platform.OS !== 'web';
  const [phase, setPhase] = useState<Phase>({ k: 'open' });
  const top = useSafeAreaInsets().top;

  useAutoUpdate(api, () => setPhase((p) => (p.k === 'open' ? { k: 'ready' } : p)));

  useEffect(() => {
    // Play sürümünde güncellemeyi Play yapar: site APK denetimi yok.
    if (!active || PLAY_SURUMU) return;
    let alive = true;
    void checkApk(installed, apkLoader).then((apk) => {
      if (alive && apk.kind === 'zorunlu') setPhase({ k: 'apk', adres: apk.adres });
    });
    return () => {
      alive = false;
    };
  }, [active, installed, apkLoader]);

  // MP-6: APK uygulama içinde iner ve kurucu doğrudan açılır; olmazsa eski yol (tarayıcı).
  const apkGuncelle = async (adres: string) => {
    setPhase({ k: 'apk-indiriyor', adres, oran: 0 });
    const r =
      Platform.OS === 'android'
        ? await apkKur(adres, gercekKurucu(), (oran) =>
            setPhase({ k: 'apk-indiriyor', adres, oran }),
          )
        : 'hata';
    if (r === 'hata') void Linking.openURL(adres);
    setPhase({ k: 'apk', adres });
  };

  if (phase.k === 'open') return null;
  if (phase.k === 'ready') {
    return (
      <View
        style={[styles.strip, { top: top + 8 }]}
        testID="yeni-surum-seridi"
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.stripText}>{t.readyTitle}</Text>
        <Pressable
          accessibilityRole="button"
          testID="sonra-dugmesi"
          onPress={() => setPhase({ k: 'open' })}
          style={styles.stripLater}
        >
          <Text style={styles.stripLaterText}>{t.later}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="yeniden-baslat-dugmesi"
          onPress={() => void api.reload().catch(() => setPhase({ k: 'open' }))}
          style={styles.stripButton}
        >
          <Text style={styles.stripButtonText}>{t.restart}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.cover} testID="guncelleme-kapisi" accessibilityViewIsModal>
      <Image
        source={IMAGE_FILES['amblem_yalin.png'] as number}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text accessibilityRole="header" style={styles.title}>
        {t.apkTitle}
      </Text>
      <Text style={styles.body}>
        {phase.k === 'apk' ? t.apkBody : `${t.apkIniyor} %${Math.round(phase.oran * 100)}`}
      </Text>
      {phase.k === 'apk-indiriyor' ? (
        <ActivityIndicator color="#FFFFFF" size="large" style={styles.spin} />
      ) : (
        <Pressable
          accessibilityRole="button"
          testID="apk-dugmesi"
          onPress={() => void apkGuncelle(phase.adres)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{t.apkButton}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 12,
    backgroundColor: '#0E3B37',
  },
  stripText: { flex: 1, fontFamily: fontFamily.bold, fontSize: 14, color: '#FFFFFF' },
  stripLater: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  stripLaterText: { fontFamily: fontFamily.semibold, fontSize: 14, color: '#B2E2DA' },
  stripButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#D9A441',
    justifyContent: 'center',
  },
  stripButtonText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: '#0A2C28' },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#0E3B37',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  logo: { width: 118, height: 143, marginBottom: 10 },
  title: { fontFamily: fontFamily.extrabold, fontSize: 22, color: '#FFFFFF', textAlign: 'center' },
  body: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 22,
    color: '#B2E2DA',
    textAlign: 'center',
    maxWidth: 320,
  },
  spin: { marginTop: 10 },
  button: {
    marginTop: 12,
    minHeight: 52,
    minWidth: 220,
    paddingHorizontal: 28,
    borderRadius: 26,
    backgroundColor: '#D9A441',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fontFamily.extrabold, fontSize: 17, color: '#0A2C28' },
});
