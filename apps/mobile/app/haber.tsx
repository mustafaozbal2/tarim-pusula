import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, colors, Durum, fontFamily, fontSize } from '@tarim/ui';
import type { AnnouncementDto, OrnekIcerikDto } from '../src/api/client';
import { AnnouncementCard } from '../src/components/AnnouncementCard';
import { ImageSlot } from '../src/components/ImageSlot';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import type { ImageName } from '../src/assets';
import { tr } from '../src/i18n/tr';
import { withDeadline } from '../src/load/deadline';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { loadAnnouncements } from '../src/today/announcements';

type Shown =
  { kind: 'duyuru'; a: AnnouncementDto } | { kind: 'ornek'; c: OrnekIcerikDto; i: number };

/** Kayan şeritteki kartın detayı: duyuru metni (ya da demo örnek kartı), kaynak ve tarih. */
export default function NewsScreen() {
  const { id, fieldId, ornek, i } = useLocalSearchParams<{
    id?: string;
    fieldId?: string;
    /** Demo örnek kartı: ürün kimliği ve kart sırası. */
    ornek?: string;
    i?: string;
  }>();
  const [shown, setShown] = useState<Shown | null | undefined | 'error'>(undefined);
  const load = useCallback(() => {
    setShown(undefined);
    const work = async (): Promise<Shown | null> => {
      if (ornek) {
        const c = await api.ornekIcerik(ornek);
        const n = Number(i ?? 0);
        return c.kartlar[n] ? { kind: 'ornek', c, i: n } : null;
      }
      if (!fieldId) return null;
      const list = await loadAnnouncements(api, kv, fieldId);
      const a = list.find((x) => x.id === id && !x.needsBadge);
      return a ? { kind: 'duyuru', a } : null;
    };
    void withDeadline(work())
      .then(setShown)
      .catch(() => setShown('error'));
  }, [id, fieldId, ornek, i]);
  useEffect(load, [load]);
  return (
    <Screen title={tr.home.newsTitle}>
      {shown === undefined ? <Iskelet rows={1} /> : null}
      {shown === 'error' ? <YuklemeHatasi onRetry={load} /> : null}
      {shown === null ? <Durum kind="bos" text={tr.home.newsMissing} /> : null}
      {shown && shown !== 'error' && shown.kind === 'duyuru' ? (
        <AnnouncementCard a={shown.a} />
      ) : null}
      {shown && shown !== 'error' && shown.kind === 'ornek' ? (
        <Card style={styles.card} testID="ornek-kart-detay">
          <ImageSlot
            name={shown.c.kartlar[shown.i]!.gorsel as ImageName}
            label={shown.c.kartlar[shown.i]!.baslik}
            style={styles.image}
          />
          <Text style={styles.title}>{shown.c.kartlar[shown.i]!.baslik}</Text>
          <Text style={styles.body}>{shown.c.kartlar[shown.i]!.ozet}</Text>
          <Text style={styles.small}>
            {tr.common.source}: {shown.c.kaynak} · {shown.c.surum} · {shown.c.tarih}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  image: { width: '100%', height: 180, borderRadius: 10 },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
