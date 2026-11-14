import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fontFamily, homeColors } from '@tarim/ui';
import { Robot } from '../asistan/Robot';
import { ALT_SEKMELER, altCubukGorunur, type Anahtar } from './altCubukYol';

const KOYU = '#14504F';
/** Orta düğmenin banttan yukarı taştığı yükseklik. */
const TASMA = 20;
const DAIRE = 62;

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
    case 'ikiz':
      // İki yan yana tarla: gerçek ve sanal ikiz.
      return (
        <Svg {...p}>
          <Path
            d="M3 18V9.5l4-3 4 3V18M13 18V9.5l4-3 4 3V18M2 18h20M7 13.5v2M17 13.5v2"
            fill="none"
            stroke={renk}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'hava':
      return (
        <Svg {...p}>
          <Circle cx={9} cy={9} r={3.4} fill="none" stroke={renk} strokeWidth={2} />
          <Path
            d="M9 2.5v1.4M3 9h1.4M4.8 4.8l1 1M13.2 4.8l-1 1"
            stroke={renk}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path
            d="M8 20h9.5a3.5 3.5 0 0 0 .4-6.97A5 5 0 0 0 8.4 14.2 3 3 0 0 0 8 20z"
            fill="none"
            stroke={renk}
            strokeWidth={2}
            strokeLinejoin="round"
          />
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
    default:
      return null;
  }
}

/**
 * Alt gezinme çubuğu: üst bantla aynı renk. Ortada robotlu yuvarlak Yapay zekâ düğmesi banttan taşar;
 * diğer dört düğme kabartmalı. Bandın arkasında sayfa zemini rengi vardır: yuvarlak köşelerde koyu leke kalmaz.
 */
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
    <View testID="alt-cubuk" style={styles.kap}>
      <View style={styles.bant} pointerEvents="none" />
      <View style={[styles.satir, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {ALT_SEKMELER.map((s) => {
          const acik = s.eslesen.test(yol);
          const git = () => {
            if (!acik) router.navigate(s.rota as never);
          };
          if (s.key === 'yz') {
            return (
              <Pressable
                key={s.key}
                testID="alt-yz"
                accessibilityRole="button"
                accessibilityLabel={s.ad}
                accessibilityState={{ selected: acik }}
                onPress={git}
                style={styles.orta}
              >
                <View style={styles.daire}>
                  <Robot size={50} id="robot-alt" />
                </View>
                <Text style={[styles.yazi, styles.yaziOrta]} numberOfLines={1}>
                  {s.ad}
                </Text>
              </Pressable>
            );
          }
          const renk = acik ? KOYU : '#FFFFFF';
          return (
            <Pressable
              key={s.key}
              testID={`alt-${s.key}`}
              accessibilityRole="button"
              accessibilityLabel={s.ad}
              accessibilityState={{ selected: acik }}
              onPress={git}
              style={styles.oge}
            >
              <View style={[styles.hap, acik && styles.hapAcik]}>
                <Ikon k={s.key} renk={renk} />
              </View>
              <Text
                style={[styles.yazi, { color: acik ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }]}
                numberOfLines={1}
              >
                {s.ad}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sayfa zemini: bandın yuvarlak köşelerinin arkası koyu değil, sayfayla aynı renk.
  kap: { backgroundColor: colors.background },
  bant: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: TASMA,
    bottom: 0,
    backgroundColor: homeColors.band,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  satir: { flexDirection: 'row', paddingHorizontal: 6, alignItems: 'flex-start' },
  oge: { flex: 1, alignItems: 'center', paddingTop: TASMA + 8, gap: 3, minHeight: 56 },
  // Kabartmalı düğme: bandan biraz açık dolgu, ışık kenarı, kısa gölge.
  hap: {
    width: 50,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#63C4C4',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#0B3B3C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  hapAcik: { backgroundColor: '#E9F4F1', borderColor: '#FFFFFF' },
  orta: { flex: 1, alignItems: 'center', gap: 1, minHeight: 56 },
  daire: {
    width: DAIRE,
    height: DAIRE,
    borderRadius: DAIRE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F4F1',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0B3B3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
  },
  yazi: { fontFamily: fontFamily.semibold, fontSize: 12 },
  yaziOrta: { fontFamily: fontFamily.extrabold, color: '#FFFFFF' },
});
