import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { fontFamily, homeColors } from '@tarim/ui';
import { ALT_SEKMELER, altCubukGorunur, type Anahtar } from './altCubukYol';

function Ikon({ k, renk }: { k: Anahtar; renk: string }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24' } as const;
  switch (k) {
    case 'ana':
      return (
        <Svg {...p}>
          <Path
            d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
            fill="none"
            stroke={renk}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'takvim':
      return (
        <Svg {...p}>
          <Rect
            x={3.5}
            y={5}
            width={17}
            height={15.5}
            rx={2.5}
            fill="none"
            stroke={renk}
            strokeWidth={2}
          />
          <Path d="M3.5 10h17M8 3v4M16 3v4" stroke={renk} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      );
    case 'yz':
      return (
        <Svg {...p}>
          <Rect
            x={4}
            y={7}
            width={16}
            height={12}
            rx={4}
            fill="none"
            stroke={renk}
            strokeWidth={2}
          />
          <Circle cx={9.5} cy={13} r={1.4} fill={renk} />
          <Circle cx={14.5} cy={13} r={1.4} fill={renk} />
          <Path d="M12 7V4M10.5 4h3" stroke={renk} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      );
    case 'pazar':
      return (
        <Svg {...p}>
          <Path
            d="M4 19V10M10 19V5M16 19v-7M21 19H3"
            stroke={renk}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}

export function AltCubuk() {
  const yol = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [klavye, setKlavye] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const a = Keyboard.addListener('keyboardDidShow', () => setKlavye(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKlavye(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  if (klavye || !altCubukGorunur(yol)) return null;
  return (
    <View testID="alt-cubuk" style={[styles.cubuk, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {ALT_SEKMELER.map((s) => {
        const acik = s.eslesen.test(yol);
        const renk = acik ? '#FFFFFF' : 'rgba(255,255,255,0.78)';
        return (
          <Pressable
            key={s.key}
            testID={`alt-${s.key}`}
            accessibilityRole="button"
            accessibilityLabel={s.ad}
            accessibilityState={{ selected: acik }}
            onPress={() => {
              if (!acik) router.navigate(s.rota as never);
            }}
            style={styles.oge}
          >
            <View style={[styles.hap, acik && styles.hapAcik]}>
              <Ikon k={s.key} renk={renk} />
            </View>
            <Text style={[styles.yazi, { color: renk }, acik && styles.yaziAcik]} numberOfLines={1}>
              {s.ad}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cubuk: {
    flexDirection: 'row',
    backgroundColor: homeColors.band,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#0B3B3C',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 12,
  },
  oge: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  hap: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hapAcik: { backgroundColor: 'rgba(255,255,255,0.26)' },
  yazi: { fontFamily: fontFamily.semibold, fontSize: 12 },
  yaziAcik: { fontFamily: fontFamily.extrabold },
});
