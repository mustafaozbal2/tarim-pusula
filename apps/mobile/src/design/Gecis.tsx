import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * G26 tasarım yardımcıları: yumuşak geçişler (SVG degrade), ışık halesi ve hafif hareketler. Hareketler
 * yerel sürücüyle (useNativeDriver) çalışır; telefonda "hareketi azalt" açıksa hiç oynamaz.
 */

/** Telefonun "hareketi azalt" ayarı (erişilebilirlik). */
export function useAzHareket(): boolean {
  const [az, setAz] = useState(false);
  useEffect(() => {
    let on = true;
    void AccessibilityInfo.isReduceMotionEnabled?.().then((v) => on && setAz(!!v));
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setAz(!!v));
    return () => {
      on = false;
      sub?.remove?.();
    };
  }, []);
  return az;
}

export type Durak = { at: number; color: string; opacity: number };

/** Dikey degrade katmanı (tam kaplar, dokunuşu engellemez). */
export function Degrade({ stops, style, id }: { stops: Durak[]; style?: ViewStyle; id: string }) {
  // Yüzde boyut web'de her zaman çözülmüyor: gerçek boyut ölçülüp verilir.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box ? <DegradeSvg id={id} stops={stops} w={box.w} h={box.h} /> : null}
    </View>
  );
}

function DegradeSvg({ id, stops, w, h }: { id: string; stops: Durak[]; w: number; h: number }) {
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map((s) => (
            <Stop key={s.at} offset={s.at} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={w} height={h} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Yuvarlak ışık halesi: ortası parlak, kenara doğru saydamlaşır (kesik kenar yok). */
export function Hale({
  size,
  color = '#FFFFFF',
  strength = 0.5,
  id,
  style,
}: {
  size: number;
  color?: string;
  strength?: number;
  id: string;
  style?: ViewStyle;
}) {
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="0.55" stopColor={color} stopOpacity={strength * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Yavaş süzülme (yukarı-aşağı birkaç piksel); hareketi azalt açıksa 0. */
export function useSuzulme(px = 4, ms = 3200): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  const az = useAzHareket();
  useEffect(() => {
    if (az) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: ms / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: ms / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, az, ms]);
  return v.interpolate({ inputRange: [0, 1], outputRange: [0, -px] }) as unknown as Animated.Value;
}

/** Açılışta bir kez: saydamdan görünür ve aşağıdan yerine kayar. */
export function useBelirme(delay = 0, from = 18) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);
  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  };
}
