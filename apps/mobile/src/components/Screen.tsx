import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@tarim/ui';

/** Ortak ekran iskeleti: zemin rengi, kenar boşluğu, kaydırma. Ekran başına tek ana iş. */
export function Screen({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  /** Kaydırmadan bağımsız, alt menünün üstünde sabit duran ana eylem şeridi. */
  footer?: ReactNode;
}) {
  const scroll = (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {title ? (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
  if (!footer) return scroll;
  return (
    <View style={styles.frame}>
      {scroll}
      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.background },
  footer: { padding: spacing.xl, paddingTop: spacing.sm, backgroundColor: colors.background },
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
