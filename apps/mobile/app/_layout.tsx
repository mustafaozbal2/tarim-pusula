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
import { Platform, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../src/i18n';
import { queue, useToken } from '../src/session';
import { useSettings } from '../src/settings';

/** Çevrimdışıyken sıraya alınan işleri bağlantı gelince gönderir. */
const FLUSH_EVERY_MS = 20_000;

function useSessionGate() {
  const token = useToken();
  const segments = useSegments();
  const router = useRouter();
  const onLogin = segments[0] === 'giris';
  useEffect(() => {
    if (token === undefined) return; // oturum henüz okunuyor
    if (!token && !onLogin) router.replace('/giris');
    else if (token && onLogin) router.replace('/');
  }, [token, onLogin, router]);

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

/** Tarayıcıda telefon boyutunda, ortalanmış dar sütun; cihazda tam ekran. */
const webFrame =
  Platform.OS === 'web'
    ? ({
        flex: 1,
        width: '100%',
        maxWidth: 430,
        alignSelf: 'center',
        overflow: 'hidden',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: '#D5DBCB',
      } as const)
    : ({ flex: 1 } as const);

export default function RootLayout() {
  // Yazı tipi yüklenemese bile uygulama sistem yazısıyla açılır.
  useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  useSessionGate();
  // Yazı boyutu değişince ağaç yeniden kurulur (Text sarmalayıcısı yeni ölçeği okur).
  const { textSize } = useSettings();
  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style="dark" />
      <View key={textSize} style={webFrame}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </I18nextProvider>
  );
}
