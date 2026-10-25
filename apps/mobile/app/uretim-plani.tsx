import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, colors, Durum, fontFamily, fontSize } from '@tarim/ui';
import type { CalendarDto } from '../src/api/client';
import { Screen } from '../src/components/Screen';
import { loadCalendar } from '../src/calendar/load';
import { rangeText } from '../src/calendar/model';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';

const t = tr.plan;

/**
 * Üretim planı: seçili arazinin ürünü ve önümüzdeki işleri (yalnız onaylı takvim satırları), satış
 * için Pazar bağlantısı. Uygunluk/maliyet hesapları veri kaynağı bağlanınca eklenir; uydurulmaz.
 */
export default function PlanScreen() {
  const router = useRouter();
  const [res, setRes] = useState<{ name: string; cal: CalendarDto } | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      void loadCalendar(api, kv)
        .then((r) => setRes(r ? { name: r.field.name, cal: r.data } : null))
        .catch(() => setRes(null));
    }, []),
  );
  const events = (res?.cal.events ?? []).filter((e) => !e.needsBadge);
  return (
    <Screen title={t.title}>
      {res === undefined ? <Durum kind="yukleniyor" text={t.loading} /> : null}
      {res === null ? <Durum kind="bos" text={t.noField} /> : null}
      {res ? (
        <>
          <Text style={styles.title}>{res.name}</Text>
          {events.length === 0 ? <Durum kind="bos" text={t.noEvents} /> : null}
          {events.map((e) => (
            <Card key={`${e.templateId}-${e.start}`} style={styles.card} testID="plan-is">
              <Text style={styles.when}>{rangeText(e)}</Text>
              <Text style={styles.body}>{e.title}</Text>
              <Text style={styles.small}>
                {tr.common.source}: {e.source} · {e.sourceVersion} · {e.sourceDate}
              </Text>
            </Card>
          ))}
          <Button label={t.market} variant="secondary" onPress={() => router.push('/pazar')} />
          <Button label={t.calendar} variant="secondary" onPress={() => router.push('/takvim')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  card: { gap: 2 },
  when: { fontFamily: fontFamily.extrabold, fontSize: fontSize.small, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
