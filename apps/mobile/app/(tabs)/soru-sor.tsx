import { StyleSheet, Text } from 'react-native';
import { BigChoice, Button, colors, fontFamily } from '@tarim/ui';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';

const t = tr.ask;

export default function AskScreen() {
  return (
    <Screen title={t.title}>
      <Text style={styles.subtitle}>{t.subtitle}</Text>
      <Button label={t.voice} style={styles.voice} />
      <Button label={t.photo} variant="secondary" />
      <Button label={t.type} variant="secondary" />
      <Text style={styles.section}>{t.frequent}</Text>
      {t.questions.map((q) => (
        <BigChoice key={q} title={q} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 18, color: colors.textMuted },
  voice: { minHeight: 80 },
  section: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest, marginTop: 8 },
});
