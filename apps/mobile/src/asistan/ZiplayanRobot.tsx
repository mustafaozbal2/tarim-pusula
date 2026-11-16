import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useAzHareket } from '../design/Gecis';
import { Robot } from './Robot';

const yerelSurucu = Platform.OS !== 'web';

/**
 * Kendi kendine zıplayan Nuvia: sohbet boşken ekranın ortasında durur. Zıplarken hafifçe esner, yere inerken
 * basılır; altındaki gölge yükseldikçe küçülür (canlı ama yormayan hareket). "Hareketi azalt" açıksa durur.
 */
export function ZiplayanRobot({
  size = 120,
  id = 'robot-ziplayan',
}: {
  size?: number;
  id?: string;
}) {
  const az = useAzHareket();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (az) return;
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: 430,
          easing: Easing.out(Easing.quad),
          useNativeDriver: yerelSurucu,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: 430,
          easing: Easing.in(Easing.quad),
          useNativeDriver: yerelSurucu,
        }),
        // Yere inince kısa bir nefes: her zıplayış arasında durur (sürekli sekmek yorar).
        Animated.delay(520),
      ]),
    );
    dongu.start();
    return () => dongu.stop();
  }, [az, t]);
  const yukseklik = size * 0.2;
  return (
    <View
      style={{ width: size * 1.3, height: size + yukseklik + 14, alignItems: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="ziplayan-robot"
    >
      {/* Işık halesi */}
      <View
        style={[
          styles.hale,
          { width: size * 1.25, height: size * 1.25, borderRadius: size, top: yukseklik * 0.3 },
        ]}
      />
      <Animated.View
        style={{
          marginTop: yukseklik,
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -yukseklik] }) },
            // Yerdeyken hafif basık (0,96), havadayken hafif uzun (1,04).
            {
              scaleY: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.95, 1.03, 1.04] }),
            },
            {
              scaleX: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1.05, 0.98, 0.97] }),
            },
          ],
        }}
      >
        <Robot size={size} id={id} />
      </Animated.View>
      <Animated.View
        style={[
          styles.golge,
          {
            width: size * 0.56,
            height: size * 0.1,
            borderRadius: size * 0.1,
            opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.1] }),
            transform: [{ scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.62] }) }],
          },
        ]}
      />
    </View>
  );
}

/** "Düşünüyorum": sırayla zıplayan üç nokta. */
export function DusunmeNoktalari({ renk = '#1F7A6D' }: { renk?: string }) {
  const az = useAzHareket();
  const d = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (az) return;
    const donguler = d.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: yerelSurucu,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: yerelSurucu,
          }),
          Animated.delay(420 - i * 140),
        ]),
      ),
    );
    donguler.forEach((x) => x.start());
    return () => donguler.forEach((x) => x.stop());
  }, [az, d]);
  return (
    <View style={styles.noktalar} testID="dusunme-noktalari">
      {d.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.nokta,
            {
              backgroundColor: renk,
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
              ],
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hale: { position: 'absolute', backgroundColor: 'rgba(95,211,148,0.16)' },
  golge: { backgroundColor: '#0E3B37', marginTop: 4 },
  noktalar: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 18, paddingTop: 8 },
  nokta: { width: 8, height: 8, borderRadius: 4 },
});
