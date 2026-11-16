import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { fontFamily } from '@tarim/ui';
import { Robot } from '../asistan/Robot';
import { karsilamaKapat } from './durum';

const yerelSurucu = Platform.OS !== 'web';

/** Karşılama kartının sayfaları: yalnız genel vizyon; ekranlar ve sekmeler sayfa turlarında anlatılır. */
export const KARSILAMA_SAYFALARI: {
  simge: 'pusula' | 'dongu' | 'hedef' | 'filiz';
  baslik: string;
  metin: string;
  maddeler: string[];
}[] = [
  {
    simge: 'pusula',
    baslik: 'Tarım Pusula nedir?',
    metin:
      'Tarlanın cebindeki yardımcısı. Havayı, suyu, haberi ve desteği tek yerde toplar; her bilgiyi nereden aldığını da yazar.',
    maddeler: [],
  },
  {
    simge: 'dongu',
    baslik: 'Nasıl çalışır?',
    metin: '',
    maddeler: [
      'Tarlanı bir kez eklersin: yeri ve ürünü.',
      'Biz her gün havaya, uyduya ve resmî duyurulara bakarız.',
      'Sana yalnız kendi tarlanı ilgilendireni söyleriz.',
    ],
  },
  {
    simge: 'hedef',
    baslik: 'Hedefimiz',
    metin:
      'Daha az su, daha az masraf, daha çok ürün. Köydeki çiftçi bilgiye şehirdeki kadar kolay ulaşsın.',
    maddeler: [],
  },
  {
    simge: 'filiz',
    baslik: 'Kullanırsan ne olur?',
    metin: '',
    maddeler: [
      'Don ve fırtına gelmeden haberin olur.',
      'Ne zaman, ne kadar sulayacağını bilirsin.',
      'Hibe ve destek başvurusunun son gününü kaçırmazsın.',
      'Aklına takılanı yazarak ya da sesle sorarsın.',
    ],
  },
];

function Simge({ ad }: { ad: (typeof KARSILAMA_SAYFALARI)[number]['simge'] }) {
  const ortak = {
    stroke: '#FFFFFF',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={46} height={46} viewBox="0 0 48 48">
      {ad === 'pusula' ? (
        <>
          <Circle cx={24} cy={24} r={18} {...ortak} />
          <Path d="M30.5 17.5l-3.6 9.4-9.4 3.6 3.6-9.4z" {...ortak} fill="rgba(255,255,255,0.28)" />
          <Circle cx={24} cy={24} r={1.6} fill="#FFFFFF" />
        </>
      ) : null}
      {ad === 'dongu' ? (
        <>
          <Path d="M39 24a15 15 0 0 1-26.6 9.5M9 24a15 15 0 0 1 26.6-9.5" {...ortak} />
          <Path d="M36 7v8h-8M12 41v-8h8" {...ortak} />
        </>
      ) : null}
      {ad === 'hedef' ? (
        <>
          <Circle cx={24} cy={24} r={18} {...ortak} />
          <Circle cx={24} cy={24} r={10.5} {...ortak} />
          <Circle cx={24} cy={24} r={3.2} fill="#FFFFFF" />
        </>
      ) : null}
      {ad === 'filiz' ? (
        <>
          <Path d="M24 42V24" {...ortak} />
          <Path
            d="M24 26c0-8-6-13-14-13 0 8 6 13 14 13z"
            {...ortak}
            fill="rgba(255,255,255,0.28)"
          />
          <Path
            d="M24 20c0-7 5-11 13-11 0 7-5 11-13 11z"
            {...ortak}
            fill="rgba(255,255,255,0.28)"
          />
          <Path d="M12 42h24" {...ortak} />
        </>
      ) : null}
    </Svg>
  );
}

/**
 * İlk girişte bir kez açılan karşılama kartı: ekranın yaklaşık %80'ini kaplayan yeşil kart, beyaz yazı.
 * Dokundukça sayfa ilerler; son sayfada "Başlayalım" ana sayfa turunu başlatır.
 */
export function Karsilama() {
  const [i, setI] = useState(0);
  const [boyut, setBoyut] = useState({ w: 0, h: 0 });
  const giris = useRef(new Animated.Value(0)).current;
  const sayfa = useRef(new Animated.Value(1)).current;
  const s = KARSILAMA_SAYFALARI[i]!;
  const son = i === KARSILAMA_SAYFALARI.length - 1;

  useEffect(() => {
    Animated.timing(giris, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: yerelSurucu,
    }).start();
  }, [giris]);

  useEffect(() => {
    const b = BackHandler.addEventListener('hardwareBackPress', () => {
      if (i > 0) setI(i - 1);
      else karsilamaKapat();
      return true;
    });
    return () => b.remove();
  }, [i]);

  const ilerle = () => {
    if (son) {
      karsilamaKapat();
      return;
    }
    sayfa.setValue(0);
    setI(i + 1);
    Animated.timing(sayfa, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: yerelSurucu,
    }).start();
  };

  const kartW = Math.min(boyut.w * 0.88, 400);
  const kartH = Math.min(boyut.h * 0.8, 680);
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.perde]}
      onLayout={(e: LayoutChangeEvent) =>
        setBoyut({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      testID="karsilama"
      accessibilityViewIsModal
    >
      {boyut.w > 0 ? (
        <Animated.View
          style={[
            styles.kart,
            {
              width: kartW,
              height: kartH,
              opacity: giris,
              transform: [
                { scale: giris.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          <Svg width={kartW} height={kartH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id="karsilama-zemin" x1="0" y1="0" x2="0.4" y2="1">
                <Stop offset="0" stopColor="#2FA36B" />
                <Stop offset="0.55" stopColor="#1F8558" />
                <Stop offset="1" stopColor="#136246" />
              </LinearGradient>
            </Defs>
            <Rect width={kartW} height={kartH} fill="url(#karsilama-zemin)" />
            {/* Süs: tarla sıralarını andıran yumuşak yaylar ve ışık lekeleri. */}
            <Circle
              cx={kartW * 0.92}
              cy={kartH * 0.06}
              r={kartW * 0.34}
              fill="rgba(255,255,255,0.09)"
            />
            <Circle
              cx={kartW * 0.02}
              cy={kartH * 0.98}
              r={kartW * 0.46}
              fill="rgba(255,255,255,0.07)"
            />
            <Path
              d={`M0 ${kartH * 0.86} Q${kartW * 0.5} ${kartH * 0.76} ${kartW} ${kartH * 0.88}`}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={2}
              fill="none"
            />
            <Path
              d={`M0 ${kartH * 0.91} Q${kartW * 0.5} ${kartH * 0.82} ${kartW} ${kartH * 0.93}`}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={2}
              fill="none"
            />
          </Svg>
          <Pressable
            style={styles.govde}
            onPress={ilerle}
            accessibilityRole="button"
            accessibilityLabel={`${s.baslik}. ${s.metin} ${s.maddeler.join('. ')}. ${son ? 'Başlamak' : 'Devam etmek'} için dokun.`}
            testID="karsilama-ilerle"
          >
            <View style={styles.ust}>
              <View style={styles.robot}>
                <Robot size={46} id="robot-karsilama" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.marka}>TARIM PUSULA</Text>
                <Text style={styles.slogan}>Bilinçli Tarım, Verimli Üretim</Text>
              </View>
              <Pressable
                onPress={karsilamaKapat}
                accessibilityRole="button"
                accessibilityLabel="Tanıtımı kapat"
                testID="karsilama-kapat"
                hitSlop={8}
                style={styles.kapat}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="#FFFFFF"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                  />
                </Svg>
              </Pressable>
            </View>
            <ScrollView
              style={styles.orta}
              contentContainerStyle={styles.ortaIc}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={{
                  alignItems: 'center',
                  gap: 12,
                  opacity: sayfa,
                  transform: [
                    {
                      translateX: sayfa.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }),
                    },
                  ],
                }}
              >
                <View style={styles.simge}>
                  <Simge ad={s.simge} />
                </View>
                <Text style={styles.baslik} testID="karsilama-baslik">
                  {s.baslik}
                </Text>
                {s.metin ? <Text style={styles.metin}>{s.metin}</Text> : null}
                {s.maddeler.length > 0 ? (
                  <View style={styles.maddeler}>
                    {s.maddeler.map((m, n) => (
                      <View key={m} style={styles.madde}>
                        <View style={styles.maddeNo}>
                          <Text style={styles.maddeNoYazi}>{n + 1}</Text>
                        </View>
                        <Text style={styles.maddeYazi}>{m}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Animated.View>
            </ScrollView>
            <View style={styles.alt}>
              <View style={styles.noktalar}>
                {KARSILAMA_SAYFALARI.map((x, n) => (
                  <View key={x.baslik} style={[styles.nokta, n === i && styles.noktaAcik]} />
                ))}
              </View>
              <View style={styles.dugme}>
                <Text style={styles.dugmeYazi}>{son ? 'Başlayalım' : 'Devam'}</Text>
              </View>
              <Text style={styles.ipucu}>
                {son
                  ? 'Şimdi ekranı düğme düğme göstereceğim; dokundukça ilerler'
                  : 'Kartın herhangi bir yerine dokunabilirsin'}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  perde: { backgroundColor: 'rgba(6,34,32,0.78)', alignItems: 'center', justifyContent: 'center' },
  kart: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#03201A',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  govde: { flex: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  ust: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  robot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  marka: {
    fontFamily: fontFamily.extrabold,
    fontSize: 17,
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  slogan: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: 'rgba(255,255,255,0.88)' },
  kapat: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orta: { flex: 1, marginTop: 8 },
  ortaIc: { flexGrow: 1, justifyContent: 'center', paddingVertical: 10 },
  simge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baslik: {
    fontFamily: fontFamily.extrabold,
    fontSize: 25,
    lineHeight: 31,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  metin: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  maddeler: { alignSelf: 'stretch', gap: 8 },
  madde: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  maddeNo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maddeNoYazi: { fontFamily: fontFamily.extrabold, fontSize: 13, color: '#136246' },
  maddeYazi: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 21,
    color: '#FFFFFF',
  },
  alt: { alignItems: 'center', gap: 10 },
  noktalar: { flexDirection: 'row', gap: 6 },
  nokta: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  noktaAcik: { width: 24, backgroundColor: '#FFFFFF' },
  dugme: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: '#BFE3D2',
    shadowColor: '#03201A',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dugmeYazi: { fontFamily: fontFamily.extrabold, fontSize: 17, color: '#136246' },
  ipucu: { fontFamily: fontFamily.medium, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
});
