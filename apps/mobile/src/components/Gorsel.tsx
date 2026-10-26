import type { ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, elevation, fontFamily, fontSize, homeColors, radius } from '@tarim/ui';
import { IMAGE_FILES, type ImageName } from '../assets';
import { Icon, type IconName } from './Icon';

/**
 * G23 görsel dil: ana sayfanın turkuazı, yuvarlak köşe, gölgeli kabartı. Çiftçi bir bakışta anlasın diye
 * her sayfanın başında bir görsel ve tek cümle; seçenekler büyük ikonlu kartlarla.
 */

/** Sayfa başlığı görseli: geniş fotoğraf + üstünde kısa açıklama. */
export function SayfaGorseli({
  image,
  text,
  testID,
}: {
  image: ImageName;
  text: string;
  testID?: string;
}) {
  return (
    <View style={styles.hero} testID={testID ?? 'sayfa-gorseli'}>
      <Image
        source={IMAGE_FILES[image] as number}
        style={styles.heroImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.heroShade} />
      <Text style={styles.heroText}>{text}</Text>
    </View>
  );
}

/** Ikon: images/ görseli ya da çizgi ikon, açık turkuaz daire içinde. */
export function IkonDaire({
  image,
  icon,
  size = 52,
  tint = homeColors.tabSelected,
}: {
  image?: ImageName;
  icon?: IconName;
  size?: number;
  tint?: string;
}) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {image ? (
        <Image
          source={IMAGE_FILES[image] as number}
          style={{ width: size * 0.74, height: size * 0.74 }}
          resizeMode="contain"
        />
      ) : icon ? (
        <Icon name={icon} size={size * 0.5} color={tint} />
      ) : null}
    </View>
  );
}

/** Büyük ikonlu seçenek kartı (çocuğun anlayacağı: resim + kısa ad + tek satır açıklama). */
export function IkonKart({
  title,
  hint,
  image,
  icon,
  onPress,
  testID,
  wide,
  tone = 'normal',
}: {
  title: string;
  hint?: string;
  image?: ImageName;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
  /** Tam genişlik (yan yana iki yerine tek). */
  wide?: boolean;
  tone?: 'normal' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        wide ? styles.tileWide : styles.tileHalf,
        pressed && styles.pressed,
        tone === 'danger' && styles.tileDanger,
      ]}
    >
      <IkonDaire image={image} icon={icon} tint={tone === 'danger' ? colors.brick : undefined} />
      <View style={wide ? styles.tileTextWide : styles.tileText}>
        <Text
          style={[
            styles.tileTitle,
            wide && styles.left,
            tone === 'danger' && { color: colors.brick },
          ]}
        >
          {title}
        </Text>
        {hint ? <Text style={[styles.tileHint, wide && styles.left]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** İkonlu kartların ızgarası (iki sütun). */
export function KartIzgara({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.grid} testID={testID}>
      {children}
    </View>
  );
}

/** Bölüm başlığı: turkuaz çizgi + kalın yazı. */
export function Bolum({
  title,
  children,
  style,
}: {
  title: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionBar} />
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 150,
    borderRadius: radius.card,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: homeColors.band,
    ...elevation.card,
  },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  heroShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,52,51,0.38)',
  },
  heroText: {
    fontFamily: fontFamily.extrabold,
    fontSize: 17,
    lineHeight: 22,
    color: '#FFFFFF',
    padding: 14,
  },
  circle: { backgroundColor: colors.pistachio, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
    ...elevation.card,
  },
  tileHalf: { width: '48.4%', minHeight: 132, alignItems: 'center' },
  tileWide: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  tileDanger: { borderColor: colors.brickSoft },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileText: { alignItems: 'center', gap: 2 },
  tileTextWide: { flex: 1, gap: 2 },
  tileTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.row,
    color: colors.forest,
    textAlign: 'center',
  },
  tileHint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  left: { textAlign: 'left' },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionBar: { width: 5, height: 20, borderRadius: 3, backgroundColor: homeColors.band },
  sectionTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.title,
    color: colors.forest,
  },
});
