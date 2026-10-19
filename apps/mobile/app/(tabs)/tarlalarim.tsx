import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily } from '@tarim/ui';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';

const t = tr.fields;

export default function FieldsScreen() {
  return (
    <Screen title={t.title}>
      {t.items.map((f) => (
        <Card key={f.name} style={styles.card}>
          <Text style={styles.name}>{f.name}</Text>
          <Text style={styles.detail}>{f.detail}</Text>
          <View style={styles.status}>
            <Text style={styles.statusText}>{f.status}</Text>
          </View>
        </Card>
      ))}
      <Text style={styles.sample}>{tr.common.sampleData}</Text>
      <Button label={t.add} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  detail: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.textMuted },
  status: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.pistachio,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusText: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.pistachioText },
  sample: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.textMuted },
});
