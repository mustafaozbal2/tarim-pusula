import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../src/i18n';
import { onPushTap } from '../src/push';
import { queue, useSessionKind, useToken } from '../src/session';
import { useAutoUpdate } from '../src/updates';
import { useSettings } from '../src/settings';

/** Çevrimdışıyken sıraya alınan işleri bağlantı gelince gönderir. */
const FLUSH_EVERY_MS = 20_000;

function useSessionGate() {
  const token = useToken();
  const kind = useSessionKind();
  const segments = useSegments();
  const router = useRouter();
  const root = segments[0] as string | undefined;
  const onLogin = root === 'giris';
  useEffect(() => {
    if (token === undefined || kind === undefined) return; // oturum henüz okunuyor
    if (!token) {
      if (!onLogin) router.replace('/giris');
      return;
    }
    const staff = kind === 'yetkili';
    // G24: giriş sonrası doğru ana ekran; yetkili çiftçi ekranlarına, çiftçi yetkili ekranlarına düşmez.
    if (onLogin) router.replace(staff ? '/yetkili' : '/');
    else if (staff && (root === '(tabs)' || root === undefined)) router.replace('/yetkili');
    else if (!staff && root === 'yetkili') router.replace('/');
  }, [token, kind, onLogin, root, router]);

  // G24: telefon bildirimine dokununca ilgili ekran (çiftçi oturumunda).
  useEffect(() => {
    if (!token || kind === 'yetkili') return;
    return onPushTap((path) => router.push(path));
  }, [token, kind, router]);

  useEffect(() => {
    if (!token) return;
    const flush = () => void queue.flush().catch(() => undefined);
    flush();
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    globalThis.addEventListener?.('online', flush);
    return () => {
      clearInterval(timer);
      globalThis.removeEventListener?.('online', flush);
    };
  }, [token]);
}

/**
 * Tarayıcıda telefon boyutunda, ortalanmış dar sütun; cihazda tam ekran. Kenar çizgisi yalnız sütundan
 * geniş ekranda çizilir: telefon tarayıcısında içerik 2 px daralıp ölçüler kaymasın (G22).
 */
function webFrame(windowWidth: number, wide = false) {
  if (Platform.OS !== 'web') return { flex: 1 } as const;
  // G24: yetkili ekranları web'de masaüstü genişliğinde (en çok 1040 px) açılır.
  const max = wide ? 1040 : 430;
  const framed = windowWidth > max;
  return {
    flex: 1,
    width: '100%',
    maxWidth: max,
    alignSelf: 'center',
    overflow: 'hidden',
    borderLeftWidth: framed ? 1 : 0,
    borderRightWidth: framed ? 1 : 0,
    borderColor: '#D5DBCB',
  } as const;
}

export default function RootLayout() {
  // Yazı tipi yüklenemese bile uygulama sistem yazısıyla açılır.
  useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  useSessionGate();
  // Yeni sürüm yayınlanınca telefon kendisi indirip yeniden açılır (açılışta ve öne gelişte).
  useAutoUpdate();
  // Yazı boyutu değişince ağaç yeniden kurulur (Text sarmalayıcısı yeni ölçeği okur).
  const { textSize } = useSettings();
  const { width } = useWindowDimensions();
  const wide = (useSegments()[0] as string | undefined) === 'yetkili';
  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style="dark" />
      <View key={textSize} style={webFrame(width, wide)}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </I18nextProvider>
  );
}
