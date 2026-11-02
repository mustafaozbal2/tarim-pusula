import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { shouldCheckOnResume, syncUpdate, type UpdatesApi } from './core';

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

/** Açılışta ve uygulama her öne geldiğinde yeni sürümü denetler; varsa indirip yeniden açar. */
export function useAutoUpdate(api: UpdatesApi = expoUpdates) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!api.enabled) return;
    const run = () => {
      const now = Date.now();
      if (!shouldCheckOnResume(last.current, now)) return;
      last.current = now;
      void syncUpdate(api);
    };
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => sub.remove();
  }, [api]);
}
