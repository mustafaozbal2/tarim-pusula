import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Durum } from '@tarim/ui';
import type { AnnouncementDto } from '../src/api/client';
import { AnnouncementCard } from '../src/components/AnnouncementCard';
import { Screen } from '../src/components/Screen';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { loadAnnouncements } from '../src/today/announcements';

/** Kayan şeritteki kartın detayı: duyuru metni, kaynak ve tarih. */
export default function NewsScreen() {
  const { id, fieldId } = useLocalSearchParams<{ id?: string; fieldId?: string }>();
  const [a, setA] = useState<AnnouncementDto | null | undefined>(undefined);
  useEffect(() => {
    if (!fieldId) return setA(null);
    void loadAnnouncements(api, kv, fieldId).then((list) =>
      setA(list.find((x) => x.id === id && !x.needsBadge) ?? null),
    );
  }, [id, fieldId]);
  return (
    <Screen title={tr.home.newsTitle}>
      {a === undefined ? <Durum kind="yukleniyor" text={tr.today.loading} /> : null}
      {a === null ? <Durum kind="bos" text={tr.home.newsMissing} /> : null}
      {a ? <AnnouncementCard a={a} /> : null}
    </Screen>
  );
}
