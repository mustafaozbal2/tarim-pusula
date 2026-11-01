import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, elevation, fontFamily, fontSize, homeColors, radius } from '@tarim/ui';
import { tr } from '../i18n/tr';
import { Icon, type IconName } from './Icon';
import { UstBant } from './UstBant';

/**
 * Yetkili paneli iskeleti: çiftçi ekranlarıyla aynı turkuaz bant, açık gri zemin; web'de geniş
 * (masaüstü) sütun. Çekip bırakınca yenilenir.
 */
export function YetkiliEkran({
  title,
  children,
  onRefresh,
  refreshing = false,
  onBack,
  root,
  testID,
}: {
  title: string;
  root?: boolean;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onBack?: () => void;
  testID?: string;
}) {
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID={testID}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <UstBant title={title} onBack={onBack} hideBack={root} />
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

/** Başlıklı beyaz kart. */
export function Bolum({
  title,
  children,
  right,
  testID,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      {title || right ? (
        <View style={styles.cardHead}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Panel kutucuğu: ikon, başlık, kısa açıklama, sayı rozeti. Geniş ekranda yan yana dizilir. */
export function PanelKutu({
  icon,
  title,
  hint,
  count,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  count?: number;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${title}, ${count}` : title}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.tileIcon}>
        <Icon name={icon} size={24} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
      </View>
      {count ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
      <Icon name="chevronRight" size={20} color={homeColors.tabSelected} />
    </Pressable>
  );
}

export function PanelKutular({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** Küçük durum etiketi (yazıyla; renk tek başına anlam taşımaz). */
export function Etiket({ label, tone = 'normal' }: { label: string; tone?: 'normal' | 'uyari' }) {
  return (
    <View style={[styles.tag, tone === 'uyari' && { backgroundColor: colors.amberSoft }]}>
      <Text style={[styles.tagText, tone === 'uyari' && { color: colors.amberText }]}>{label}</Text>
    </View>
  );
}

/** Küçük düğme (liste satırlarında). */
export function KucukDugme({
  label,
  onPress,
  tone = 'ana',
  testID,
  busy,
}: {
  label: string;
  onPress: () => void;
  tone?: 'ana' | 'ikinci' | 'tehlike';
  testID?: string;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [
        styles.small,
        tone === 'ana' && { backgroundColor: colors.forest },
        tone === 'ikinci' && styles.smallSecond,
        tone === 'tehlike' && { backgroundColor: colors.brick },
        (pressed || busy) && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.smallText, tone === 'ikinci' && { color: colors.forest }]}>
        {busy ? tr.auth.wait : label}
      </Text>
    </Pressable>
  );
}

export function Yukleniyor() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.forest} />
    </View>
  );
}

export function Bos({ children }: { children: ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

export const yetkiliText = StyleSheet.create({
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: homeColors.text },
  muted: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  strong: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  label: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: homeColors.page },
  content: { paddingBottom: 28 },
  body: { padding: 12, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
    ...elevation.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest, flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: 300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    padding: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: homeColors.tabSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { fontFamily: fontFamily.extrabold, fontSize: 16, color: homeColors.text },
  tileHint: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  count: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    backgroundColor: homeColors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: fontFamily.extrabold, fontSize: 13, color: '#FFFFFF' },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.pistachio,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.forest },
  small: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallSecond: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.forest },
  smallText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: '#FFFFFF' },
  loading: { padding: 24, alignItems: 'center' },
  empty: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.small,
    color: colors.textMuted,
    paddingVertical: 6,
  },
});
