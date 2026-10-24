import { StyleSheet, Text, View } from 'react-native';
import { Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';

/** Başlıklı, madde işaretli kısa bilgi kartı ("Nasıl okunur?", "Nasıl çalışır?"). */
export function BilgiKarti({
  title,
  lines,
  testID,
}: {
  title: string;
  lines: string[];
  testID?: string;
}) {
  return (
    <Card testID={testID} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {lines.map((l) => (
        <View key={l} style={styles.row}>
          <View style={styles.dot} />
          <Text style={styles.text}>{l}</Text>
        </View>
      ))}
    </Card>
  );
}

/** Üç sayılı özet karolar (ör. tarla sayısı · toplam alan · cihaz). */
export function OzetKarolari({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={styles.tiles}>
      {items.map((i) => (
        <View key={i.label} style={styles.tile}>
          <Text style={styles.tileValue}>{i.value}</Text>
          <Text style={styles.tileLabel}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, backgroundColor: colors.card },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.listGreen,
    marginTop: 7,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.small,
    color: colors.forest,
    lineHeight: 19,
  },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  tileValue: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, color: colors.textMuted },
});
