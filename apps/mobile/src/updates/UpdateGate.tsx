import { useCallback, useEffect, useState } from 'react';
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
import { fontFamily } from '@tarim/ui';
import { IMAGE_FILES } from '../assets';
import { tr } from '../i18n/tr';
import { apkKur, gercekKurucu } from './apkKur';
import { applyUpdate, checkApk, checkAtStart, type ApkManifest, type UpdatesApi } from './core';

const t = tr.gate;
const SITE = process.env['EXPO_PUBLIC_SITE_URL'] ?? 'https://tarimpusula.onrender.com';

type Phase =
  | { k: 'checking' }
  | { k: 'open' }
  | { k: 'update' }
  | { k: 'downloading' }
  | { k: 'failed' }
  | { k: 'apk'; adres: string }
  | { k: 'apk-indiriyor'; adres: string; oran: number };

/** Sitedeki surum.json'u okur (yerel kod değişince yüklü APK'nın en az sürümünü bildirir). */
export const loadApkManifest = async (): Promise<ApkManifest> => {
  const r = await fetch(`${SITE}/surum.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as ApkManifest;
};

/**
 * Soğuk açılışta güncelleme kapısı: yeni sürüm varsa uygulamanın üstüne kapatılamayan tam ekran "Güncelle"
 * ekranı gelir; güncellenmeden uygulamaya girilmez. Bağlantı yoksa ya da denetim 8 sn'de bitmezse engellenmez
 * (tarlada internet çekmeyebilir). Yüklü APK çok eskiyse (yerel kod değişti) yeni APK indirme ekranı çıkar.
 * Altta uygulama kurulu kalır (oturum ve gezinme çalışır); kapı yalnız örtüdür.
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
  const [phase, setPhase] = useState<Phase>(active ? { k: 'checking' } : { k: 'open' });

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void (async () => {
      const [apk, ota] = await Promise.all([checkApk(installed, apkLoader), checkAtStart(api)]);
      if (!alive) return;
      if (apk.kind === 'zorunlu') setPhase({ k: 'apk', adres: apk.adres });
      else setPhase(ota === 'var' ? { k: 'update' } : { k: 'open' });
    })();
    return () => {
      alive = false;
    };
  }, [active, api, installed, apkLoader]);

  const update = useCallback(async () => {
    setPhase({ k: 'downloading' });
    const r = await applyUpdate(api);
    // 'yeniden-aciliyor' ise uygulama kapanıp açılır; 'guncel' (başka yerden inmiş) ise girilir.
    if (r === 'hata') setPhase({ k: 'failed' });
    else if (r === 'guncel') setPhase({ k: 'open' });
  }, [api]);

  // MP-6: APK uygulama içinde iner ve kurucu doğrudan açılır; olmazsa eski yol (tarayıcı).
  const apkGuncelle = async (adres: string) => {
    setPhase({ k: 'apk-indiriyor', adres, oran: 0 });
    const r =
      Platform.OS === 'android'
        ? await apkKur(adres, gercekKurucu(), (oran) =>
            setPhase({ k: 'apk-indiriyor', adres, oran }),
          )
        : 'hata';
    if (r === 'hata') {
      void Linking.openURL(adres);
      setPhase({ k: 'apk', adres });
    } else {
      setPhase({ k: 'apk', adres });
    }
  };

  if (phase.k === 'open') return null;
  const busy = phase.k === 'checking' || phase.k === 'downloading' || phase.k === 'apk-indiriyor';
  const title =
    phase.k === 'apk' || phase.k === 'apk-indiriyor'
      ? t.apkTitle
      : phase.k === 'checking'
        ? t.checking
        : t.updateTitle;
  const body =
    phase.k === 'apk'
      ? t.apkBody
      : phase.k === 'apk-indiriyor'
        ? `${t.apkIniyor} %${Math.round(phase.oran * 100)}`
        : phase.k === 'downloading'
          ? t.downloading
          : phase.k === 'failed'
            ? t.failed
            : phase.k === 'update'
              ? t.updateBody
              : null;
  return (
    <View style={styles.cover} testID="guncelleme-kapisi" accessibilityViewIsModal>
      <Image
        source={IMAGE_FILES['amblem_yalin.png'] as number}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {busy ? <ActivityIndicator color="#FFFFFF" size="large" style={styles.spin} /> : null}
      {phase.k === 'update' || phase.k === 'failed' ? (
        <Pressable
          accessibilityRole="button"
          testID="guncelle-dugmesi"
          onPress={() => void update()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{phase.k === 'failed' ? t.retry : t.updateButton}</Text>
        </Pressable>
      ) : null}
      {phase.k === 'apk' ? (
        <Pressable
          accessibilityRole="button"
          testID="apk-dugmesi"
          onPress={() => void apkGuncelle(phase.adres)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{t.apkButton}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
