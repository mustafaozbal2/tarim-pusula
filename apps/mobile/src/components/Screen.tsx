import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import { DemoBadge } from './DemoBadge';

/**
 * Ortak ekran iskeleti: açık gri zemin, koyu yeşil başlık şeridi, sıkı kenar boşluğu (12 px), kaydırma.
 * Bir ekranda birden fazla bilgi grubu (kart, tablo, liste) olabilir (TASARIM_REFERANSI yoğunluk kuralları).
 */
export function Screen({
  title,
  children,
  footer,
  hero,
}: {
  title?: string;
  children: ReactNode;
  /** Kaydırmadan bağımsız, alt menünün üstünde sabit duran ana eylem şeridi. */
  footer?: ReactNode;
  /** Başlık şeridi yerine ekranın en üstünde tam genişlikte bölüm (Bugün: konum+hava). */
  hero?: ReactNode;
}) {
  const scroll = (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {hero}
      {title ? (
        <View style={styles.bar}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>
      ) : null}
      <View style={[styles.body, !hero && !title && { paddingTop: spacing.xl }]}>
        <DemoBadge />
        {children}
      </View>
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
  footer: { padding: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  bar: {
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.xl,
    paddingTop: 28,
    paddingBottom: spacing.lg,
  },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.onForest },
  body: { padding: spacing.lg, gap: spacing.md },
});

export const bodyText = {
  fontFamily: fontFamily.semibold,
  fontSize: fontSize.body,
  color: colors.forest,
} as const;
