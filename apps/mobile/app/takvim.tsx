import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import type { CalendarEventDto } from '../src/api/client';
import { eventSource, groupEvents, rangeText } from '../src/calendar/model';
import { loadCalendar, type CalendarResult } from '../src/calendar/load';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { nextFieldId } from '../src/today/load';
import { clock } from '../src/today/model';

const t = tr.calendar;

/** Tek iş kartı: ne, ne zaman, kaynak; onaysızsa rozet ve "Neden?" altında gerekçe. */
function EventCard({ e }: { e: CalendarEventDto }) {
  const [open, setOpen] = useState(false);
  return (
    <Card testID="takvim-is" style={styles.card}>
      <Text style={styles.when}>{rangeText(e)}</Text>
      <Text style={styles.body}>{e.title}</Text>
      <Text style={styles.small}>{e.detail}</Text>
      {e.needsBadge ? (
        <>
          <Badge label={t.pendingBadge} />
          <Text style={styles.small}>{t.pendingNote}</Text>
        </>
      ) : null}
      <Text style={styles.small} testID="takvim-kaynak">
        {t.source}: {eventSource(e)}
      </Text>
      <Button label={t.why} variant="secondary" onPress={() => setOpen((v) => !v)} />
      {open ? <Text style={styles.small}>{e.why}</Text> : null}
    </Card>
  );
}

export default function CalendarScreen() {
  const { fieldId } = useLocalSearchParams<{ fieldId?: string }>();
  const [res, setRes] = useState<CalendarResult | null | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(
    async (pick?: string) => {
      try {
        setRes(await loadCalendar(api, kv, pick ?? fieldId));
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [fieldId],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = (
    <>
      <FlowHeader />
      <Text accessibilityRole="header" style={styles.title}>
        {t.title}
      </Text>
    </>
  );
  if (state !== 'ready' || res === undefined) {
    return (
      <FlowScreen>
        {header}
        <Text style={styles.small}>{state === 'error' ? t.error : t.loading}</Text>
      </FlowScreen>
    );
  }
  if (res === null) {
    return (
      <FlowScreen>
        {header}
        <Text style={styles.body}>{t.noField}</Text>
      </FlowScreen>
    );
  }

  const { field, data } = res;
  const groups = groupEvents(data.events);
  return (
    <FlowScreen
      footer={
        res.fields.length > 1 ? (
          <Button
            label={t.nextField}
            variant="secondary"
            onPress={() => void load(nextFieldId(res.fields, field.id))}
          />
        ) : undefined
      }
    >
      {header}
      <Text style={styles.body} testID="takvim-tarla">
        {field.name}
      </Text>
      <Text style={styles.small}>{t.intro}</Text>
      {res.offline ? <Notice tone="warn">{t.offline}</Notice> : null}
      {data.cropId === null ? (
        <Text style={styles.body} testID="takvim-urun-yok">
          {t.noCrop}
        </Text>
      ) : data.events.length === 0 ? (
        <Text style={styles.body} testID="takvim-bos">
          {t.empty}
        </Text>
      ) : null}
      {groups.now.length > 0 ? (
        <View style={styles.group} testID="takvim-simdi">
          <Text accessibilityRole="header" style={styles.groupTitle}>
            {t.nowTitle}
          </Text>
          {groups.now.map((e) => (
            <EventCard key={`${e.templateId}-${e.start}`} e={e} />
          ))}
        </View>
      ) : null}
      {groups.soon.length > 0 ? (
        <View style={styles.group} testID="takvim-yaklasan">
          <Text accessibilityRole="header" style={styles.groupTitle}>
            {t.soonTitle}
          </Text>
          {groups.soon.map((e) => (
            <EventCard key={`${e.templateId}-${e.start}`} e={e} />
          ))}
        </View>
      ) : null}
      <Text style={styles.small} testID="takvim-guncelleme">
        {t.lastUpdate}: {clock(res.at)}
      </Text>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, color: colors.forest },
  body: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  when: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  groupTitle: { fontFamily: fontFamily.extrabold, fontSize: 22, color: colors.forest },
  group: { gap: spacing.md },
  card: { gap: spacing.sm },
});
