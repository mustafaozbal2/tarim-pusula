import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import { tr } from '../i18n/tr';
import { DemoBadge } from './DemoBadge';
import { Icon } from './Icon';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {hero}
      {title ? (
        <View style={[styles.bar, { paddingTop: Math.max(insets.top, 12) + 12 }]}>
          {/* Alt sekme çubuğu yok (G19): her alt sayfadan ana sayfaya geri dönülür. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr.flow.back}
            testID="geri"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.back}
          >
            <Icon name="back" size={22} color={colors.onForest} />
          </Pressable>
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
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: -12,
    marginVertical: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.title,
    color: colors.onForest,
  },
  body: { padding: spacing.lg, gap: spacing.md },
});

export const bodyText = {
  fontFamily: fontFamily.semibold,
  fontSize: fontSize.body,
  color: colors.forest,
} as const;
