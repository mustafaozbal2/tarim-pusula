import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@tarim/ui';

/** Ortak ekran iskeleti: zemin rengi, kenar boşluğu, kaydırma. Ekran başına tek ana iş. */
export function Screen({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {title ? (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 48, gap: spacing.md },
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, color: colors.forest },
  body: { gap: spacing.md },
});

export const bodyText = {
  fontFamily: fontFamily.semibold,
  fontSize: fontSize.body,
  color: colors.forest,
} as const;
