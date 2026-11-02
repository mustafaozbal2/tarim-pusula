import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, fontSize, homeColors, spacing } from '@tarim/ui';
import { DemoBadge } from './DemoBadge';
import { UstBant } from './UstBant';

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
  const insets = useSafeAreaInsets();
  const scroll = (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      {hero}
      {/* Alt sekme çubuğu yok (G19): her alt sayfadan ana sayfaya geri dönülür; bant ana sayfayla aynı dilde. */}
      {title ? <UstBant title={title} /> : null}
      <View style={[styles.body, !hero && !title && { paddingTop: spacing.xl }]}>
        <DemoBadge />
        {children}
      </View>
    </ScrollView>
  );
  // Kaydırınca içerik saat/pil satırının altına girmesin: o şerit bant renginde sabit kalır.
  const cover =
    insets.top > 0 ? (
      <View pointerEvents="none" style={[styles.statusCover, { height: insets.top }]} />
    ) : null;
  return (
    <View style={styles.frame}>
      {scroll}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>{footer}</View>
      ) : null}
      {cover}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.background },
  statusCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: homeColors.band,
  },
  footer: { padding: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  body: { padding: spacing.lg, gap: spacing.md },
});

export const bodyText = {
  fontFamily: fontFamily.semibold,
  fontSize: fontSize.body,
  color: colors.forest,
} as const;
