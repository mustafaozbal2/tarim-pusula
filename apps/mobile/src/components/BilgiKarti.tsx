import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, colors, elevation, fontFamily, fontSize, homeColors, spacing } from '@tarim/ui';

type GorunumRef = Ref<ComponentRef<typeof View>>;

/** Başlıklı, madde işaretli kısa bilgi kartı ("Nasıl okunur?", "Nasıl çalışır?"). */
export function BilgiKarti({
  title,
  lines,
  testID,
  ref,
}: {
  title: string;
  lines: string[];
  testID?: string;
  ref?: GorunumRef;
}) {
  return (
    <Card ref={ref} testID={testID} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.mark}>
          <Text style={styles.markText}>i</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
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
export function OzetKarolari({
  items,
  ref,
}: {
  items: { label: string; value: string }[];
  ref?: GorunumRef;
}) {
  return (
    <View ref={ref} style={styles.tiles}>
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
  // Bilgi kartı: açık turkuaz zemin, solda kalın turkuaz şerit (not kâğıdı hissi).
  card: {
    gap: spacing.md,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
    borderLeftColor: homeColors.band,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontFamily: fontFamily.extrabold, fontSize: 13, lineHeight: 17, color: '#FFFFFF' },
  title: {
    flex: 1,
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.row,
    color: colors.forest,
  },
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
  // Özet karosu: kabartmalı küçük kutu; sayı kalın ve büyük, etiket ince.
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: '#EAF6F4',
    borderBottomWidth: 3,
    borderBottomColor: '#BFDCD7',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
    ...elevation.card,
  },
  tileValue: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  tileLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
