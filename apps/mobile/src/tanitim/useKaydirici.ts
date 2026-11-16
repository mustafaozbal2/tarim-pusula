import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, type ComponentRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { kaydiriciEkle } from './hedef';

/**
 * Sayfanın kaydırma görünümünü tanıtım turuna tanıtır: hedef ekranın altındaysa tur sayfayı oraya kaydırır.
 * Kullanım: `const k = useTanitimKaydirici(); <ScrollView ref={k.ref} onScroll={k.onScroll} scrollEventThrottle={32}>`.
 * Yalnız odaktaki sayfa kayıtlıdır (yığında alttaki sayfa kaydırılmaz).
 */
export function useTanitimKaydirici() {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const konum = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    konum.current = e.nativeEvent.contentOffset.y;
  }, []);
  useFocusEffect(
    useCallback(
      () =>
        kaydiriciEkle({
          kaydir: (y) => ref.current?.scrollTo({ y, animated: true }),
          konum: () => konum.current,
        }),
      [],
    ),
  );
  return { ref, onScroll };
}
