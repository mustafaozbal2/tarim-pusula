import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { prefetchUpdate, shouldCheckOnResume, type UpdatesApi } from './core';

export * from './core';

export const expoUpdates: UpdatesApi = {
  // Web'de ve geliştirme sunucusunda EAS Update yoktur.
  enabled: Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled,
  check: () => Updates.checkForUpdateAsync(),
  fetch: () => Updates.fetchUpdateAsync(),
  reload: () => Updates.reloadAsync(),
};

/** Yüklü sürümün yayın tarihi (gömülü sürümse null). */
export const updateDate = (): Date | null =>
  Updates.isEmbeddedLaunch ? null : (Updates.createdAt ?? null);

/** Yüklü APK'nın sürümü (yerel kodun sürümü; EAS güncellemesi bunu değiştirmez). */
export const installedVersion = (): string => Updates.runtimeVersion ?? '0.0.0';

/**
 * Açılışta ve uygulama her öne geldiğinde yeni sürümü arka planda sessizce indirir (kimseyi bekletmez,
 * yeniden açmaz; form ortasında veri kaybolmasın). İndiyse onReady çağrılır: "Yeni sürüm hazır" şeridi.
 */
export function useAutoUpdate(api: UpdatesApi, onReady: () => void) {
  const last = useRef<number | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!api.enabled) return;
    const run = () => {
      const now = Date.now();
      if (!shouldCheckOnResume(last.current, now)) return;
      last.current = now;
      void prefetchUpdate(api).then((yeni) => yeni && ready.current());
    };
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => sub.remove();
  }, [api]);
}
