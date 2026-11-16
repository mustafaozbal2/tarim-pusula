import { usePathname } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { sayfaAdimlari, sayfaAnahtari } from './adimlar';
import { turAc } from './durum';
import { hedefRef } from './hedef';

/**
 * Mavi ampul: her sayfanın üst bandında durur. Dokununca o sayfanın tanıtımı baştan açılır
 * (çiftçi bir düğmeyi anlamadıysa yeniden baktırır). Sayfanın tanıtımı yoksa düğme çizilmez.
 */
export function YardimDugmesi({
  boyut = 36,
  style,
}: {
  boyut?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const sayfa = sayfaAnahtari(usePathname());
  if (sayfaAdimlari(sayfa).length === 0) return null;
  return (
    <Pressable
      ref={hedefRef('ortak.yardim')}
      accessibilityRole="button"
      accessibilityLabel="Bu sayfayı anlat"
      testID="yardim-dugmesi"
      onPress={() => turAc(sayfa)}
      hitSlop={6}
      style={({ pressed }) => [styles.dokun, pressed && { transform: [{ scale: 0.94 }] }, style]}
    >
      <View style={[styles.daire, { width: boyut, height: boyut, borderRadius: boyut / 2 }]}>
        <Svg width={boyut * 0.58} height={boyut * 0.58} viewBox="0 0 24 24">
          <Path
            d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="rgba(255,255,255,0.22)"
          />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dokun: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Mavi, ışıklı ve kabartmalı: turkuaz bantta hemen seçilir ama temayı bozmaz.
  daire: {
    backgroundColor: '#2F7FE0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#1B5FB8',
    shadowOpacity: 0.55,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
