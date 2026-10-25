import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { withDeadline } from '../load/deadline';
import { kv } from '../offline/kvStore';
import { api } from '../session';
import { loadToday, type TodayResult } from '../today/load';

export type TodayState = 'loading' | 'empty' | 'ready' | 'error';

/** Seçili arazinin bugünkü bilgisi (ana sayfayla aynı arazi seçimi, çevrimdışı önbellekli). */
export function useToday() {
  const [data, setData] = useState<TodayResult | null>(null);
  const [state, setState] = useState<TodayState>('loading');
  const load = useCallback(async () => {
    setState((s) => (s === 'error' ? 'loading' : s));
    try {
      // En geç 10 sn: ağ yavaşsa iskelette asılı kalmaz, "Veri alınamadı" + yeniden dene görünür.
      const r = await withDeadline(loadToday(api, kv));
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
