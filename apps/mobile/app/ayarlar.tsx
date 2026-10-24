import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, SekmeAnahtari, spacing } from '@tarim/ui';
import { Screen } from '../src/components/Screen';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { tr } from '../src/i18n/tr';
import { currentApiUrl, setToken } from '../src/session';
import { updateSettings, useSettings } from '../src/settings';
import type { TextSize } from '@tarim/ui';

const t = tr.settings;

/** Uygulama sürümü: app.json "version" alanı. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

export default function SettingsScreen() {
  const router = useRouter();
  const s = useSettings();
  const [server, setServer] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void currentApiUrl().then(setServer);
  }, []);

  return (
    <Screen title={t.title}>
      <Card style={styles.card}>
        <Text style={styles.label}>{t.textSize}</Text>
        <SekmeAnahtari<TextSize>
          testID="ayar-yazi-boyutu"
          value={s.textSize}
          onChange={(v) => void updateSettings({ textSize: v })}
          options={[
            { key: 'normal', label: t.normal },
            { key: 'large', label: t.large },
          ]}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>{t.voice}</Text>
        <SekmeAnahtari<'on' | 'off'>
          testID="ayar-ses"
          value={s.voiceGuide ? 'on' : 'off'}
          onChange={(v) => void updateSettings({ voiceGuide: v === 'on' })}
          options={[
            { key: 'on', label: t.voiceOn },
            { key: 'off', label: t.voiceOff },
          ]}
        />
        <Text style={styles.hint}>{t.voiceHint}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>{t.lists}</Text>
        <Button
          label={tr.lists.open}
          variant="secondary"
          onPress={() => router.push('/kc-listesi')}
        />
        <Button
          label={tr.lists.openSoil}
          variant="secondary"
          onPress={() => router.push('/toprak-turleri')}
        />
      </Card>

      <Card style={styles.card} testID="ayar-hakkinda">
        <Text style={styles.label}>{t.about}</Text>
        <View style={styles.row}>
          <Text style={styles.hint}>{t.version}</Text>
          <Text style={styles.value} testID="ayar-surum">
            {APP_VERSION}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.hint}>{t.server}</Text>
          <Text style={styles.value}>{server ?? t.serverNone}</Text>
        </View>
        <Text style={styles.hint}>{tr.app.slogan}</Text>
      </Card>

      <SunucuKarti variant="settings" />

      <Button
        label={t.logout}
        variant="danger"
        onPress={() => {
          void setToken(null).then(() => router.replace('/giris'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  label: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  hint: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  value: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
