import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { kv } from '../offline/kvStore';
import { api } from '../session';
import { loadToday, type TodayResult } from '../today/load';

export type TodayState = 'loading' | 'empty' | 'ready' | 'error';

/** Seçili arazinin bugünkü bilgisi (ana sayfayla aynı arazi seçimi, çevrimdışı önbellekli). */
export function useToday() {
  const [data, setData] = useState<TodayResult | null>(null);
  const [state, setState] = useState<TodayState>('loading');
  const load = useCallback(async () => {
    try {
      const r = await loadToday(api, kv);
      setData(r);
      setState(r ? 'ready' : 'empty');
    } catch {
      setState('error');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { data, state, reload: load };
}
