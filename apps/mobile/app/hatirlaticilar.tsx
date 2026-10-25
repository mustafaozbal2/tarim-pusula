import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize } from '@tarim/ui';
import type { ReminderPrefs } from '@tarim/agro-core';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { hourOf, parseThresholdPercent } from '../src/reminders/prefsInput';
import {
  checkReminders,
  loadReminderPrefs,
  reasonText,
  saveReminderPrefs,
  type CheckResult,
} from '../src/reminders/run';
import { notifyNow } from '../src/reminders/notify';
import { api } from '../src/session';

const t = tr.reminders;

export default function RemindersScreen() {
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [thr, setThr] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadReminderPrefs(kv).then((p) => {
        setPrefs(p);
        setThr(
          p.moistureThreshold === null ? '' : String(Math.round(p.moistureThreshold * 1000) / 10),
        );
      });
    }, []),
  );

  if (!prefs) return null;
  const set = (p: Partial<ReminderPrefs>) => setPrefs({ ...prefs, ...p });

  const save = async () => {
    const clean = await saveReminderPrefs(kv, {
      ...prefs,
      moistureThreshold: parseThresholdPercent(thr),
    });
    setPrefs(clean);
    setInfo(t.saved);
  };

  const check = async () => {
    setBusy(true);
    try {
      setResult(await checkReminders(api, kv, new Date(), notifyNow));
    } finally {
      setBusy(false);
    }
  };

  const noDevice = result?.data ? !result.data.hasSensor : false;
  const decisions = result?.data ? [result.data.moisture, result.data.daily] : [];

  return (
    <FlowScreen footer={<Button label={t.save} onPress={() => void save()} testID="hat-kaydet" />}>
      <FlowHeader />
      <Text accessibilityRole="header" style={styles.title}>
        {t.title}
      </Text>
      <Text style={styles.muted}>{t.intro}</Text>
      {info ? <Notice>{info}</Notice> : null}

      <Card style={styles.card}>
        <Text style={styles.name}>{t.moistureTitle}</Text>
        <View style={styles.row}>
          <Text style={[styles.muted, styles.grow]}>{t.moistureOn}</Text>
          <Switch
            accessibilityLabel={t.moistureOn}
            value={prefs.moistureEnabled}
            onValueChange={(v) => set({ moistureEnabled: v })}
          />
        </View>
        {noDevice ? <Text style={styles.muted}>{t.noDevice}</Text> : null}
        <Text style={styles.muted}>{t.threshold}</Text>
        <TextInput
          accessibilityLabel={t.threshold}
          testID="hat-esik"
          style={styles.input}
          keyboardType="decimal-pad"
          value={thr}
          onChangeText={setThr}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.name}>{t.dailyTitle}</Text>
        <View style={styles.row}>
          <Text style={[styles.muted, styles.grow]}>{t.dailyOn}</Text>
          <Switch
            accessibilityLabel={t.dailyOn}
            value={prefs.dailyEnabled}
            onValueChange={(v) => set({ dailyEnabled: v })}
          />
        </View>
        <Text style={styles.muted}>{t.hour}</Text>
        <TextInput
          accessibilityLabel={t.hour}
          testID="hat-saat"
          style={styles.input}
          keyboardType="number-pad"
          value={String(prefs.dailyHour)}
          onChangeText={(v) => set({ dailyHour: hourOf(v, prefs.dailyHour) })}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.name}>{t.quietTitle}</Text>
        <Text style={styles.muted}>{t.quietFrom}</Text>
        <TextInput
          accessibilityLabel={t.quietFrom}
          style={styles.input}
          keyboardType="number-pad"
          value={String(prefs.quiet.startHour)}
          onChangeText={(v) =>
            set({ quiet: { ...prefs.quiet, startHour: hourOf(v, prefs.quiet.startHour) } })
          }
        />
        <Text style={styles.muted}>{t.quietTo}</Text>
        <TextInput
          accessibilityLabel={t.quietTo}
          style={styles.input}
          keyboardType="number-pad"
          value={String(prefs.quiet.endHour)}
          onChangeText={(v) =>
            set({ quiet: { ...prefs.quiet, endHour: hourOf(v, prefs.quiet.endHour) } })
          }
        />
      </Card>

      <Button
        label={busy ? t.checking : t.check}
        variant="secondary"
        testID="hat-kontrol"
        onPress={() => void check()}
      />
      {result?.error ? <Notice tone="warn">{t.offline}</Notice> : null}
      {result && !result.fieldId ? <Notice tone="warn">{t.noField}</Notice> : null}
      {result?.sent.map((s) => (
        <Card key={s.type} style={styles.card}>
          <Text style={styles.name}>{s.title}</Text>
          <Text style={styles.muted}>{s.body}</Text>
        </Card>
      ))}
      {result?.data && result.sent.length === 0 ? <Text style={styles.muted}>{t.none}</Text> : null}
      {decisions.map((d, i) =>
        d.kind === 'none' ? (
          <Text key={i} style={styles.muted}>
            {reasonText(d.reason)}
          </Text>
        ) : null,
      )}
      {result?.held.map((h) => (
        <Text key={h.type} style={styles.muted}>
          {reasonText(h.reason)}
        </Text>
      ))}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  card: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.forest,
  },
});
