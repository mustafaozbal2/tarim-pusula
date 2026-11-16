import { usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { fontFamily } from '@tarim/ui';
import { Robot } from '../asistan/Robot';
import { kv } from '../offline/kvStore';
import { sayfaAdimlari, sayfaAnahtari, type TanitimAdimi } from './adimlar';
import { karsilamaAc, tanitimYukle, turAc, turAdim, turKapat, useTanitim } from './durum';
import { etkinKaydirici, hedefOlc, hedefVar, kaydirmaFarki, type Dikdortgen } from './hedef';
import { kartYeri, okYolu, otomatikAcilir } from './geometri';
import { Karsilama } from './Karsilama';

const yerelSurucu = Platform.OS !== 'web';
/** Sayfa açıldıktan sonra turun kendiliğinden başlaması için bekleme (veri ve yerleşim otursun). */
const BASLAMA_GECIKMESI_MS = 900;
const ALT_CUBUK_PAYI = 84;
/** Hedef ekran yüksekliğinin bu oranından uzunsa vurgu üst kısmıyla sınırlanır. */
const BUYUK_HEDEF_ORANI = 0.36;

/**
 * Tanıtım katmanı (kök yerleşimde, her şeyin üstünde): ilk girişte karşılama kartı, sonra çiftçinin ilk kez
 * girdiği her sayfada adım adım anlatım. Her dokunuşta bir sonraki düğmeye geçer; bitince kapanır ve o sayfa
 * için bir daha kendiliğinden açılmaz (mavi ampul düğmesiyle yeniden açılır).
 */
export function TanitimKatmani({ etkin }: { etkin: boolean }) {
  const yol = usePathname();
  const sayfa = sayfaAnahtari(yol);
  const d = useTanitim();

  useEffect(() => {
    void tanitimYukle(kv);
  }, []);

  // Kendiliğinden açılış: önce karşılama (ana sayfada), sonra o sayfanın turu.
  useEffect(() => {
    if (!etkin || !d.hazir || d.acik || d.karsilamaAcik) return;
    if (!otomatikAcilir()) return;
    if (!d.karsilamaGoruldu) {
      if (sayfa !== '/') return;
      const t = setTimeout(karsilamaAc, 500);
      return () => clearTimeout(t);
    }
    if (d.gorulenSayfalar.includes(sayfa) || sayfaAdimlari(sayfa).length === 0) return;
    const t = setTimeout(() => turAc(sayfa), BASLAMA_GECIKMESI_MS);
    return () => clearTimeout(t);
  }, [etkin, d.hazir, d.acik, d.karsilamaAcik, d.karsilamaGoruldu, d.gorulenSayfalar, sayfa]);

  // Sayfa değişirse açık tur kapanır (başka sayfanın düğmelerini göstermesin).
  useEffect(() => {
    if (d.acik && d.acik.sayfa !== sayfa) turKapat();
  }, [sayfa, d.acik]);

  if (!etkin) return null;
  if (d.karsilamaAcik) return <Karsilama />;
  if (d.acik && d.acik.sayfa === sayfa) return <Tur sayfa={sayfa} adim={d.acik.adim} />;
  return null;
}

function Tur({ sayfa, adim }: { sayfa: string; adim: number }) {
  const insets = useSafeAreaInsets();
  const kok = useRef<ComponentRef<typeof View>>(null);
  const [boyut, setBoyut] = useState({ w: 0, h: 0 });
  const [delik, setDelik] = useState<Dikdortgen | null>(null);
  const [hazir, setHazir] = useState(false);
  const [kartH, setKartH] = useState(150);
  const giris = useRef(new Animated.Value(0)).current;
  const nabiz = useRef(new Animated.Value(0)).current;

  // Tur açıldığı anda ekranda bulunan hedefler anlatılır; ekranda olmayan (ör. veri yokken çizilmeyen) adım atlanır.
  const adimlar = useMemo<TanitimAdimi[]>(
    () => sayfaAdimlari(sayfa).filter((a) => !a.hedef || hedefVar(a.hedef)),
    [sayfa],
  );
  const a = adimlar[adim];
  const son = adim >= adimlar.length - 1;

  const ilerle = useCallback(() => {
    if (son) turKapat();
    else turAdim(adim + 1);
  }, [adim, son]);

  useEffect(() => {
    if (!a) turKapat();
  }, [a]);

  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => {
      turKapat();
      return true;
    });
    return () => s.remove();
  }, []);

  useEffect(() => {
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(nabiz, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: yerelSurucu,
        }),
        Animated.timing(nabiz, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: yerelSurucu,
        }),
      ]),
    );
    dongu.start();
    return () => dongu.stop();
  }, [nabiz]);

  // Adım değişince hedef ölçülür; ekran dışındaysa sayfa kaydırılır ve yeniden ölçülür.
  useEffect(() => {
    let iptal = false;
    setHazir(false);
    giris.setValue(0);
    const olc = async () => {
      let r: Dikdortgen | null = null;
      if (a?.hedef && boyut.h > 0) {
        const koken = await new Promise<{ x: number; y: number }>((coz) => {
          const k = kok.current as unknown as {
            measureInWindow?: (cb: (x: number, y: number) => void) => void;
          } | null;
          if (!k?.measureInWindow) return coz({ x: 0, y: 0 });
          const t = setTimeout(() => coz({ x: 0, y: 0 }), 300);
          k.measureInWindow((x, y) => {
            clearTimeout(t);
            coz({ x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
          });
        });
        const yerel = (m: Dikdortgen | null): Dikdortgen | null =>
          m ? { x: m.x - koken.x, y: m.y - koken.y, w: m.w, h: m.h } : null;
        r = yerel(await hedefOlc(a.hedef));
        if (r) {
          const fark = kaydirmaFarki(r, boyut.h, insets.top, ALT_CUBUK_PAYI + insets.bottom);
          const k = etkinKaydirici();
          if (fark !== 0 && k) {
            k.kaydir(Math.max(0, k.konum() + fark));
            await new Promise((c) => setTimeout(c, 420));
            r = yerel(await hedefOlc(a.hedef)) ?? r;
          }
          // Hâlâ ekranın dışındaysa (kaydırılamayan yer) vurgu çizilmez, açıklama ortada gösterilir.
          if (r.y + r.h < 0 || r.y > boyut.h || r.x + r.w < 0 || r.x > boyut.w) r = null;
          // Ekranın yarısına yakın yer kaplayan bölümde yalnız üst kısmı ışıklandırılır: açıklama kartına ve oka yer kalır.
          else if (r.h > boyut.h * BUYUK_HEDEF_ORANI) r = { ...r, h: boyut.h * BUYUK_HEDEF_ORANI };
        }
      }
      if (iptal) return;
      setDelik(r);
      setHazir(true);
      Animated.timing(giris, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: yerelSurucu,
      }).start();
    };
    void olc();
    return () => {
      iptal = true;
    };
  }, [a, boyut.h, boyut.w, giris, insets.top, insets.bottom]);

  if (!a) return null;
  const { w, h } = boyut;
  const kartW = Math.min(Math.max(w - 28, 0), 360);
  const yer = kartYeri(delik, { w, h }, { w: kartW, h: kartH }, insets.top, insets.bottom);
  const ok = delik && yer.ok ? okYolu(delik, yer, { w: kartW, h: kartH }) : null;
  const pay = 7;
  const kose = delik ? Math.min(18, (Math.min(delik.w, delik.h) + pay * 2) / 2) : 0;
  const perde =
    delik && w > 0
      ? `M0 0H${w}V${h}H0Z ${yuvarlakDortgen(delik.x - pay, delik.y - pay, delik.w + pay * 2, delik.h + pay * 2, kose)}`
      : `M0 0H${w}V${h}H0Z`;

  return (
    <View
      ref={kok}
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) =>
        setBoyut({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      testID="tanitim-turu"
      accessibilityViewIsModal
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={ilerle}
        accessibilityRole="button"
        accessibilityLabel={`${a.baslik}. ${a.metin}. ${son ? 'Bitirmek' : 'Devam etmek'} için dokun.`}
        testID="tanitim-ilerle"
      >
        {w > 0 ? (
          <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={perde} fill="rgba(6,34,32,0.74)" fillRule="evenodd" />
            {ok ? (
              <>
                <Path
                  d={ok.govde}
                  stroke="#FFFFFF"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="1 7"
                  fill="none"
                  opacity={hazir ? 1 : 0}
                />
                <Path d={ok.uc} fill="#FFFFFF" opacity={hazir ? 1 : 0} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {delik && hazir ? (
          <Animated.View
            pointerEvents="none"
            testID="tanitim-vurgu"
            style={[
              styles.halka,
              {
                left: delik.x - pay,
                top: delik.y - pay,
                width: delik.w + pay * 2,
                height: delik.h + pay * 2,
                borderRadius: kose,
                opacity: nabiz.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
                transform: [
                  { scale: nabiz.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
                ],
              },
            ]}
          />
        ) : null}
        {w > 0 ? (
          <Animated.View
            onLayout={(e: LayoutChangeEvent) => setKartH(e.nativeEvent.layout.height)}
            testID="tanitim-kart"
            style={[
              styles.kart,
              {
                width: kartW,
                left: yer.x,
                top: yer.y,
                opacity: hazir ? giris : 0,
                transform: [
                  {
                    translateY: giris.interpolate({
                      inputRange: [0, 1],
                      outputRange: [yer.yon === 'ust' ? -10 : 10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.kartUst}>
              <View style={styles.robotKutu}>
                <Robot size={34} id="robot-tanitim" />
              </View>
              <Text style={styles.baslik} testID="tanitim-baslik">
                {a.baslik}
              </Text>
              <View style={styles.sayac}>
                <Text style={styles.sayacYazi} testID="tanitim-sayac">
                  {adim + 1} / {adimlar.length}
                </Text>
              </View>
            </View>
            <Text style={styles.metin}>{a.metin}</Text>
            <View style={styles.kartAlt}>
              <Pressable
                onPress={turKapat}
                accessibilityRole="button"
                accessibilityLabel="Tanıtımı geç"
                testID="tanitim-gec"
                hitSlop={10}
                style={styles.gec}
              >
                <Text style={styles.gecYazi}>Geç</Text>
              </Pressable>
              <View style={styles.ilerleme} testID="tanitim-ilerleme">
                <View
                  style={[
                    styles.ilerlemeDolu,
                    { width: `${Math.round(((adim + 1) / adimlar.length) * 100)}%` },
                  ]}
                />
              </View>
              <View style={styles.devam}>
                <Text style={styles.devamYazi}>{son ? 'Bitir' : 'Dokun, devam et'}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Yuvarlak köşeli dörtgen yolu (perdede delik açmak için; çift-tek dolgu kuralıyla). */
function yuvarlakDortgen(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}` +
    `A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}` +
    `A${k} ${k} 0 0 1 ${x + k} ${y}Z`
  );
}

const styles = StyleSheet.create({
  halka: {
    position: 'absolute',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#9CFFD0',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  kart: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#CFE7E3',
    shadowColor: '#041F1D',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  kartUst: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  robotKutu: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E9F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baslik: {
    flex: 1,
    fontFamily: fontFamily.extrabold,
    fontSize: 16,
    lineHeight: 21,
    color: '#14504F',
  },
  sayac: {
    backgroundColor: '#1F6E6D',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sayacYazi: { fontFamily: fontFamily.bold, fontSize: 12, color: '#FFFFFF' },
  metin: { fontFamily: fontFamily.medium, fontSize: 14.5, lineHeight: 21, color: '#231F20' },
  kartAlt: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  gec: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  gecYazi: { fontFamily: fontFamily.bold, fontSize: 13, color: '#4A5F5E' },
  ilerleme: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DDEDEA',
    overflow: 'hidden',
  },
  ilerlemeDolu: { height: 6, borderRadius: 3, backgroundColor: '#1F6E6D' },
  devam: {
    backgroundColor: '#1F6E6D',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#14504F',
  },
  devamYazi: { fontFamily: fontFamily.extrabold, fontSize: 13, color: '#FFFFFF' },
});
