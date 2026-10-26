import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, colors, Durum, fontFamily, fontSize, homeColors } from '@tarim/ui';
import type { CalendarDto } from '../src/api/client';
import { Bolum, IkonKart, KartIzgara, SayfaGorseli } from '../src/components/Gorsel';
import { Icon } from '../src/components/Icon';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { withDeadline } from '../src/load/deadline';
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
  const [res, setRes] = useState<{ name: string; cal: CalendarDto } | null | undefined | 'error'>(
    undefined,
  );
  const load = useCallback(() => {
    setRes(undefined);
    void withDeadline(loadCalendar(api, kv))
      .then((r) => setRes(r ? { name: r.field.name, cal: r.data } : null))
      .catch(() => setRes('error'));
  }, []);
  useFocusEffect(load);
  const plan = res === 'error' ? null : res;
  const events = (plan?.cal.events ?? []).filter((e) => !e.needsBadge);
  return (
    <Screen title={t.title}>
      <SayfaGorseli image="genis_ciftciler.jpg" text={t.hero} />
      {res === undefined ? <Iskelet /> : null}
      {res === 'error' ? <YuklemeHatasi onRetry={load} /> : null}
      {res === null ? <Durum kind="bos" text={t.noField} /> : null}
      {plan ? (
        <>
          <Bolum title={`${plan.name}: ${t.next}`}>
            {events.length === 0 ? <Durum kind="bos" text={t.noEvents} /> : null}
            {events.map((e) => (
              <Card key={`${e.templateId}-${e.start}`} style={styles.card} testID="plan-is">
                <View style={styles.dot}>
                  <Icon name="calendar" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.text}>
                  <Text style={styles.when}>{rangeText(e)}</Text>
                  <Text style={styles.body}>{e.title}</Text>
                  <Text style={styles.small}>{e.source}</Text>
                </View>
              </Card>
            ))}
          </Bolum>
          <KartIzgara>
            <IkonKart
              icon="chart"
              title={t.market}
              hint={t.marketHint}
              onPress={() => router.push('/pazar')}
            />
            <IkonKart
              icon="calendar"
              title={t.calendar}
              hint={t.calendarHint}
              onPress={() => router.push('/takvim')}
            />
          </KartIzgara>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: homeColors.tabSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  when: { fontFamily: fontFamily.extrabold, fontSize: fontSize.small, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
});
