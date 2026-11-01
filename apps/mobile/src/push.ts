import { Platform } from 'react-native';
import type { Api } from './api/client';

/**
 * Bildirim iznini ister ve cihaz belirtecini sunucuya kaydeder. Web'de ve izin verilmezse sessizce atlanır;
 * hata uygulamayı bozmaz. Android'de don için yüksek öncelikli kanal açılır.
 */
export async function registerForPush(api: Pick<Api, 'registerPush'>): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const N = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('don', {
        name: 'Don uyarısı',
        importance: N.AndroidImportance.MAX,
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return false;
    // EAS proje kimliği verilmezse bağımsız APK'da belirteç alınamaz (G24).
    const Constants = (await import('expo-constants')).default;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    const { data } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.registerPush(data, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch {
    return false;
  }
}

/**
 * Bildirime dokununca ilgili ekran: uzman cevabı -> Sorularım. Uygulama kapalıyken gelen dokunuş da
 * (son yanıt) işlenir. Web'de yok. Dönen işlev dinleyiciyi kaldırır.
 */
export function onPushTap(go: (path: '/sorularim' | '/bildirimler') => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let sub: { remove(): void } | null = null;
  let stopped = false;
  void import('expo-notifications')
    .then((N) => {
      if (stopped) return;
      const handle = (data: unknown) => {
        const kind = (data as { kind?: string } | null)?.kind;
        go(kind === 'uzman_cevap' ? '/sorularim' : '/bildirimler');
      };
      sub = N.addNotificationResponseReceivedListener((r) =>
        handle(r.notification.request.content.data),
      );
      const last = N.getLastNotificationResponse?.();
      if (last) handle(last.notification.request.content.data);
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    sub?.remove();
  };
}
