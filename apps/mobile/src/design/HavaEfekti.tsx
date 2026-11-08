import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Hale, useAzHareket } from './Gecis';
import { PARCACIK, tohum, type HavaSahne } from './havaSahne';

/**
 * Ana sayfa üst bandında o günün havası: güneşte sıcak ışık ve yavaş dönen ışınlar, yağmurda ince
 * damlalar, karda süzülen taneler, bulutta kayan yumuşak bulutlar, gece birkaç yıldız. Dokunuşu
 * engellemez; parçacık sayısı az ve sabit, hareketler yerel sürücüde (cihazı yormaz). Telefonda
 * "hareketi azalt" açıksa yalnız durağan ışık kalır.
 */
/** Renk takımı: bantta (koyu zemin) beyaz, sayfa gövdesinde (açık zemin) belirgin mavi-gri tonlar. */
interface Palet {
  gunes: string;
  gunesIsin: string;
  bulut: string;
  bulutGuc: number;
  sis: string;
  yagmur: string;
  kar: string;
  karKenar: string;
}
const BANT: Palet = {
  gunes: '#FFE7A3',
  gunesIsin: '#FFF4CC',
  bulut: '#FFFFFF',
  bulutGuc: 0.42,
  sis: '#FFFFFF',
  yagmur: '#FFFFFF',
  kar: '#FFFFFF',
  karKenar: 'transparent',
};
const GOVDE: Palet = {
  gunes: '#FFC93C',
  gunesIsin: '#FFD966',
  bulut: '#7F99AE',
  bulutGuc: 0.3,
  sis: '#AEBBC2',
  yagmur: '#3E7CB1',
  kar: '#FFFFFF',
  karKenar: '#9DB9CF',
};
const PaletCtx = createContext<Palet>(BANT);

/** `govde`: tüm ana sayfaya yayılan hafif katman (MP-4); parçacık sayısı pil için ölçülü. */
export function HavaEfekti({
  sahne,
  w,
  h,
  govde = false,
}: {
  sahne: HavaSahne;
  w: number;
  h: number;
  govde?: boolean;
}) {
  const az = useAzHareket();
  if (sahne === 'yok' || w <= 0 || h <= 0) return null;
  if (govde && sahne === 'gece') return null;
  return (
    <PaletCtx.Provider value={govde ? GOVDE : BANT}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.clip]}
        testID={govde ? `hava-govde-${sahne}` : `hava-efekti-${sahne}`}
      >
        {sahne === 'gunes' ? <Gunes w={w} h={h} az={az} /> : null}
        {sahne === 'bulut' || sahne === 'sis' ? (
          <Bulutlar w={w} h={h} az={az} sis={sahne === 'sis'} />
        ) : null}
        {sahne === 'yagmur' || sahne === 'firtina' ? (
          <Yagmur
            w={w}
            h={h}
            az={az}
            n={Math.round(PARCACIK[sahne] * (govde ? 1.6 : 1))}
            hizli={sahne === 'firtina'}
          />
        ) : null}
        {sahne === 'kar' ? (
          <Kar w={w} h={h} az={az} n={Math.round(PARCACIK.kar * (govde ? 1.6 : 1))} />
        ) : null}
        {sahne === 'gece' ? <Yildizlar w={w} h={h} az={az} n={PARCACIK.gece} /> : null}
      </View>
    </PaletCtx.Provider>
  );
}

/** 0→1 sonsuz döngü (gecikmeli başlangıç; bitince başa sarar). */
function useDongu(ms: number, delay: number, az: boolean, ters = false) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (az) return;
    const tek = Animated.timing(v, {
      toValue: 1,
      duration: ms,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    const loop = ters
      ? Animated.loop(
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
        )
      : Animated.loop(tek);
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, ms, delay, az, ters]);
  return v;
}

function Gunes({ w, h, az }: { w: number; h: number; az: boolean }) {
  const p = useContext(PaletCtx);
  const don = useDongu(60_000, 0, az);
  const nabiz = useDongu(5000, 0, az, true);
  // Işık sağ üstte; sol üstteki amblemin üstüne taşmaz.
  const r = Math.min(w * 0.42, h * 1.1);
  const cx = w * 0.88;
  const cy = h * 0.1;
  const rotate = don.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const opacity = nabiz.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  return (
    <>
      <Animated.View style={{ position: 'absolute', left: cx - r, top: cy - r, opacity }}>
        <Hale id="gunes-hale" size={r * 2} color={p.gunes} strength={0.65} />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          left: cx - r,
          top: cy - r,
          width: r * 2,
          height: r * 2,
          opacity: 0.32,
          transform: [{ rotate }],
        }}
      >
        <Svg width={r * 2} height={r * 2}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <Line
                key={i}
                x1={r + Math.cos(a) * r * 0.18}
                y1={r + Math.sin(a) * r * 0.18}
                x2={r + Math.cos(a) * r * 0.95}
                y2={r + Math.sin(a) * r * 0.95}
                stroke={p.gunesIsin}
                strokeWidth={i % 2 ? 3 : 6}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
      </Animated.View>
    </>
  );
}

function Bulutlar({ w, h, az, sis }: { w: number; h: number; az: boolean; sis: boolean }) {
  const bulutlar = sis ? 4 : 3;
  return (
    <>
      {Array.from({ length: bulutlar }, (_, i) => (
        <Bulut key={i} i={i} w={w} h={h} az={az} sis={sis} />
      ))}
    </>
  );
}

function Bulut({
  i,
  w,
  h,
  az,
  sis,
}: {
  i: number;
  w: number;
  h: number;
  az: boolean;
  sis: boolean;
}) {
  const p = useContext(PaletCtx);
  const ms = 38_000 + tohum(i) * 22_000;
  const v = useDongu(ms, i * 900, az);
  const size = h * (sis ? 1.6 : 0.9 + tohum(i + 7) * 0.5);
  const top = sis ? h * (0.1 + i * 0.18) - size / 2 : h * (0.05 + tohum(i + 3) * 0.45) - size / 3;
  const start = -size + tohum(i + 11) * (w + size);
  const translateX = v.interpolate({
    inputRange: [0, 1],
    outputRange: [0, w + size],
  });
  // Sağ kenardan çıkan bulut soldan yeniden girer.
  const x = Animated.modulo(Animated.add(translateX, start + size), w + size);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top,
        left: -size,
        transform: [{ translateX: x }, { scaleY: sis ? 0.35 : 0.55 }],
      }}
    >
      <Hale
        id={`bulut-${i}`}
        size={size}
        color={sis ? p.sis : p.bulut}
        strength={sis ? 0.32 : p.bulutGuc}
      />
    </Animated.View>
  );
}

function Yagmur({
  w,
  h,
  az,
  n,
  hizli,
}: {
  w: number;
  h: number;
  az: boolean;
  n: number;
  hizli: boolean;
}) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Damla key={i} i={i} w={w} h={h} az={az} hizli={hizli} />
      ))}
    </>
  );
}

function Damla({
  i,
  w,
  h,
  az,
  hizli,
}: {
  i: number;
  w: number;
  h: number;
  az: boolean;
  hizli: boolean;
}) {
  const p = useContext(PaletCtx);
  const ms = (hizli ? 520 : 820) + tohum(i) * 420;
  const v = useDongu(ms, tohum(i + 5) * 1500, az);
  const len = 10 + tohum(i + 9) * 10;
  const x = tohum(i + 1) * (w + 30) - 15;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-len - 10, h + 10] });
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, -(h * 0.2)] });
  return (
    <Animated.View
      style={[
        styles.damla,
        {
          left: x,
          height: len,
          backgroundColor: p.yagmur,
          opacity: az ? 0 : 0.35 + tohum(i + 2) * 0.35,
          transform: [{ translateY }, { translateX }, { rotate: '12deg' }],
        },
      ]}
    />
  );
}

function Kar({ w, h, az, n }: { w: number; h: number; az: boolean; n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Tane key={i} i={i} w={w} h={h} az={az} />
      ))}
    </>
  );
}

function Tane({ i, w, h, az }: { i: number; w: number; h: number; az: boolean }) {
  const p = useContext(PaletCtx);
  const ms = 5200 + tohum(i) * 3800;
  const v = useDongu(ms, tohum(i + 4) * 4000, az);
  const salin = useDongu(2600 + tohum(i + 8) * 1800, 0, az, true);
  const d = 3 + tohum(i + 6) * 4;
  const x = tohum(i + 1) * w;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-d - 4, h + 4] });
  const translateX = salin.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  return (
    <Animated.View
      style={[
        styles.tane,
        {
          left: x,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: p.kar,
          borderWidth: p.karKenar === 'transparent' ? 0 : 0.8,
          borderColor: p.karKenar,
          opacity: az ? 0 : 0.6 + tohum(i + 3) * 0.4,
          transform: [{ translateY }, { translateX }],
        },
      ]}
    />
  );
}

function Yildizlar({ w, h, az, n }: { w: number; h: number; az: boolean; n: number }) {
  const pts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({ x: tohum(i + 20) * w, y: tohum(i + 40) * h * 0.8 })),
    [n, w, h],
  );
  return (
    <>
      {pts.map((p, i) => (
        <Yildiz key={i} i={i} x={p.x} y={p.y} az={az} />
      ))}
    </>
  );
}

function Yildiz({ i, x, y, az }: { i: number; x: number; y: number; az: boolean }) {
  const v = useDongu(2200 + tohum(i) * 2400, tohum(i + 1) * 1500, az, true);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] });
  return <Animated.View style={[styles.yildiz, { left: x, top: y, opacity }]} />;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  damla: {
    position: 'absolute',
    top: 0,
    width: 1.6,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  tane: { position: 'absolute', top: 0, backgroundColor: '#FFFFFF' },
  yildiz: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFDF0',
  },
});
