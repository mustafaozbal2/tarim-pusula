import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { fontFamily } from '@tarim/ui';
import { IMAGE_FILES, type ImageName } from '../assets';
import { IMAGE_IS_PLACEHOLDER } from '../imageStatus.generated';

export type HomeIconKey =
  'arazilerim' | 'arazi-islemleri' | 'verim-haritasi' | 'hava' | 'uzman' | 'bildirim' | 'ayarlar';

/** Her ikonun görsel yuvası (images/ klasörü) ve ekran okuyucu adı. */
export const HOME_ICONS: {
  key: HomeIconKey;
  file: ImageName;
  label: string;
  route: string;
  /** Görsel kullanılmaz, SVG çizilir. */
  glyphOnly?: boolean;
}[] = [
  { key: 'arazilerim', file: 'ikon_arazilerim.png', label: 'Arazilerim', route: '/tarlalarim' },
  {
    key: 'arazi-islemleri',
    file: 'ikon_arazi_islemleri.png',
    label: 'Arazi İşlemleri',
    route: '/arazi-islemleri',
  },
  {
    key: 'verim-haritasi',
    file: 'ikon_verim_haritasi.png',
    label: 'Verim Haritası',
    route: '/verim-haritasi',
  },
  { key: 'hava', file: 'ikon_hava.png', label: 'Hava Durumu', route: '/hava' },
  { key: 'uzman', file: 'ikon_uzman.png', label: 'Uzman Desteği', route: '/soru-sor' },
  // Zil görselinde hedeften gelen sabit "1" rozeti var; yanlış sayı göstermemek için SVG zil çizilir,
  // gerçek okunmamış sayısı ayrı rozetle gösterilir (docs/KARARLAR.md, G22).
  {
    key: 'bildirim',
    file: 'ikon_bildirim.png',
    label: 'Mobil Bildirim',
    route: '/bildirimler',
    glyphOnly: true,
  },
  { key: 'ayarlar', file: 'ikon_ayarlar.png', label: 'Profil Ayarları', route: '/ayarlar' },
];

const GREEN = '#3E9A44';
const DARK = '#1F4E2E';
const ORANGE = '#F2A33A';
const BLUE = '#4A9BD6';
const BROWN = '#8A5A2B';
const RED = '#EE3270';

/** Çizgi/dolgu tek tip SVG ikonlar (emoji değil). Gerçek görsel gelince PNG kullanılır. */
function Glyph({ k, size }: { k: HomeIconKey; size: number }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32' } as const;
  switch (k) {
    case 'arazilerim':
      return (
        <Svg {...common}>
          <Circle cx={21} cy={9} r={4} fill={ORANGE} />
          <Rect x={11} y={10} width={2.4} height={9} fill={BROWN} />
          <Circle cx={12} cy={9} r={5} fill={GREEN} />
          <Path d="M3 26c5-6 21-6 26 0z" fill={GREEN} />
          <Path d="M3 26c6-3 20-3 26 0" stroke={DARK} strokeWidth={1.4} fill="none" />
        </Svg>
      );
    case 'arazi-islemleri':
      return (
        <Svg {...common}>
          <Rect x={4} y={9} width={24} height={15} rx={2} fill="#B5532E" />
          <Path d="M4 14h24M4 19h24" stroke="#F4D9A8" strokeWidth={1.6} />
          <Circle cx={10} cy={22} r={2.4} fill={BLUE} />
          <Circle cx={16} cy={22} r={2.4} fill={BLUE} />
          <Circle cx={22} cy={22} r={2.4} fill={BLUE} />
        </Svg>
      );
    case 'verim-haritasi':
      return (
        <Svg {...common}>
          <Path d="M3 9l8-3 10 3 8-3v17l-8 3-10-3-8 3z" fill="#8CC96B" />
          <Path d="M11 6v17M21 9v17" stroke={DARK} strokeWidth={1.2} />
          <Path d="M20 4a5 5 0 0 1 5 5c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 5-5z" fill={ORANGE} />
          <Circle cx={20} cy={9} r={1.8} fill="#FFFFFF" />
        </Svg>
      );
    case 'hava':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={6} fill="#F6C342" />
          <Path
            d="M12 2v3M2 12h3M5 5l2 2M19 5l-2 2"
            stroke="#F6C342"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path
            d="M12 27h13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.5A3.8 3.8 0 0 0 12 27z"
            fill="#CFE6F7"
            stroke={BLUE}
            strokeWidth={1.4}
          />
        </Svg>
      );
    case 'uzman':
      return (
        <Svg {...common}>
          <G>
            <Circle cx={16} cy={11} r={5.5} fill="#E8B993" />
            <Path d="M10.5 9.5C11 5 21 5 21.5 9.5 19 8 13 8 10.5 9.5z" fill="#2D2A26" />
            <Path d="M5 29c0-7 5-10 11-10s11 3 11 10z" fill="#2F5D8C" />
            <Path d="M13 19l3 4 3-4" fill="#FFFFFF" />
          </G>
        </Svg>
      );
    case 'bildirim':
      return (
        <Svg {...common}>
          <Path d="M7 22c2-2 2-5 2-8a7 7 0 0 1 14 0c0 3 0 6 2 8z" fill="#F6C342" />
          <Ellipse cx={16} cy={25} rx={3} ry={2.2} fill="#E0A21A" />
          <Rect x={14.8} y={4} width={2.4} height={3} rx={1} fill="#E0A21A" />
        </Svg>
      );
    case 'ayarlar':
      return (
        <Svg {...common}>
          <Path
            d="M16 3l2.2 3.2 3.8-.8.8 3.8 3.2 2.2-2 3.4 2 3.4-3.2 2.2-.8 3.8-3.8-.8L16 29l-2.2-3.2-3.8.8-.8-3.8L6 20.6l2-3.4-2-3.4 3.2-2.2.8-3.8 3.8.8z"
            fill="#FFFFFF"
            stroke="#222222"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <Circle cx={16} cy={16} r={4.2} fill="#FFFFFF" stroke="#222222" strokeWidth={1.6} />
        </Svg>
      );
  }
}

/** Yuvarlak beyaz ikon düğmesi (hedefteki gibi 38 px; dokunma alanı hitSlop ile 44+ px). */
export function HomeIconButton({
  item,
  onPress,
  badge,
  size = 38,
  pitch = 41,
  style,
}: {
  item: (typeof HOME_ICONS)[number];
  onPress: () => void;
  /** Sağ üstte kırmızı sayı rozeti (okunmamış bildirim). */
  badge?: number;
  /** Görünen daire çapı. */
  size?: number;
  /** Komşu ikonla merkezler arası mesafe; dokunma alanı 44 px, komşuyla hafif örtüşür. */
  pitch?: number;
  /** Konum (ana sayfa bandında mutlak yerleşim). */
  style?: StyleProp<ViewStyle>;
}) {
  const usePng = IMAGE_IS_PLACEHOLDER[item.file] === false && !item.glyphOnly;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge && badge > 0 ? `${item.label}, ${badge} okunmamış` : item.label}
      testID={`ikon-${item.key}`}
      onPress={onPress}
      style={[styles.touch, { marginHorizontal: (pitch - TOUCH) / 2 }, style]}
    >
      {/* Gerçek ikon görseli beyaz daireyi kendi içerir: tam çapta çizilir. */}
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          usePng && styles.clear,
        ]}
      >
        {usePng ? (
          <Image
            testID={`ikon-gorsel-${item.key}`}
            source={IMAGE_FILES[item.file] as number}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Glyph k={item.key} size={size * 0.72} />
        )}
      </View>
      {badge && badge > 0 ? (
        <View style={styles.badge} testID="ikon-bildirim-sayi">
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Dokunma hedefi (44 px); görünen daire daha küçüktür. */
const TOUCH = 44;

const styles = StyleSheet.create({
  touch: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  circle: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  clear: { backgroundColor: 'transparent' },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamily.extrabold, fontSize: 12, lineHeight: 14, color: '#FFFFFF' },
});
