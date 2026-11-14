import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { fontFamily } from '@tarim/ui';
import type { FieldDto } from '../api/client';
import { IMAGE_FILES } from '../assets';

const YESIL = '#0E3B37';
const ALTIN = '#E0A21A';

export interface MenuOgesi {
  ad: string;
  rota: string;
  ikon: IkonAdi;
  /** Sağda küçük etiket (ör. "Yeni"). */
  etiket?: string;
}

type IkonAdi =
  | 'ev'
  | 'hava'
  | 'takvim'
  | 'su'
  | 'uzman'
  | 'soru'
  | 'pazar'
  | 'yz'
  | 'ikiz'
  | 'arazi'
  | 'harita'
  | 'uydu'
  | 'rapor'
  | 'plan'
  | 'toprak'
  | 'zil'
  | 'cihaz'
  | 'haber'
  | 'kaynak'
  | 'hesap'
  | 'cuzdan'
  | 'baglanti'
  | 'ayar'
  | 'ekle';

/** Çizgi ikonlar (24x24): sade, tek renk. */
const IKON: Record<IkonAdi, string> = {
  ikiz: 'M4 18V9l4-3 4 3v9M12 18V9l4-3 4 3v9M2 18h20M8 13v2M16 13v2',
  ev: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  hava: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18z',
  takvim: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  su: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  uzman: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  soru: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z',
  pazar: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  yz: 'M5 8h14v11H5zM12 8V4M9 13h.01M15 13h.01M9 16h6',
  arazi: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z',
  harita: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  uydu: 'M4 20l4-4M7 13l4 4M10 6l8 8M14 4l6 6-4 4-6-6z',
  rapor: 'M5 3h10l4 4v14H5zM9 13h6M9 17h6M9 9h2',
  plan: 'M4 5h16M4 12h10M4 19h7',
  toprak: 'M3 18h18M5 18c1-4 4-6 7-6s6 2 7 6M12 12V6M9 8l3-2 3 2',
  zil: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  cihaz: 'M5 6h14v12H5zM9 10h.01M13 10h3M9 14h7',
  haber: 'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5',
  kaynak: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18',
  hesap: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c0-4 3-6 7-6s7 2 7 6',
  cuzdan: 'M3 7h18v12H3zM16 13h2M3 7l3-3h12',
  baglanti:
    'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  ayar: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.3-1.3L17 5l-3-1-1 2h-2l-1-2-3 1 .3 2L6 8.3 4 8l-1 3 2 1v1l-2 1 1 3 2-.3 1.3 1.3L7 19l3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3-2-1z',
  ekle: 'M12 5v14M5 12h14',
};

function Ikon({ ad, renk = YESIL }: { ad: IkonAdi; renk?: string }) {
  return (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke={renk}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={IKON[ad]} />
    </Svg>
  );
}

/** Menü grupları: alt sekmeler, üst bant ikonları ve şimdiye kadar yalnız iç sayfalardan açılan ekranlar. */
export const MENU: { baslik: string; ogeler: MenuOgesi[]; vurgulu?: boolean }[] = [
  {
    baslik: 'Yapay zekâ',
    vurgulu: true,
    ogeler: [
      { ad: 'Pusula Yapay Zekâ', rota: '/yapay-zeka', ikon: 'yz', etiket: 'Yeni' },
      { ad: 'İkiz Tarım (dijital ikiz)', rota: '/ikiz-tarim', ikon: 'ikiz', etiket: 'Yeni' },
    ],
  },
  {
    baslik: 'Günlük',
    ogeler: [
      { ad: 'Ana sayfa', rota: '/', ikon: 'ev' },
      { ad: 'Hava durumu ve don', rota: '/hava', ikon: 'hava' },
      { ad: 'İş takvimi ve notlarım', rota: '/takvim', ikon: 'takvim' },
      { ad: 'Sulama', rota: '/sulama', ikon: 'su' },
      { ad: 'Bildirimler', rota: '/bildirimler', ikon: 'zil' },
    ],
  },
  {
    baslik: 'Uzman ve bilgi',
    ogeler: [
      { ad: 'Uzmana sor', rota: '/soru-sor', ikon: 'uzman' },
      { ad: 'Sorularım ve cevaplar', rota: '/sorularim', ikon: 'soru' },
      { ad: 'Haberler', rota: '/haber', ikon: 'haber' },
      { ad: 'Resmî kaynaklar', rota: '/resmi-kaynaklar', ikon: 'kaynak' },
      { ad: 'Pazar fiyatları', rota: '/pazar', ikon: 'pazar' },
    ],
  },
  {
    baslik: 'Arazi araçları',
    ogeler: [
      { ad: 'Arazi işlemleri', rota: '/arazi-islemleri', ikon: 'arazi' },
      { ad: 'Verim haritası', rota: '/verim-haritasi', ikon: 'harita' },
      { ad: 'Uydu görüntüsü (bitki gücü)', rota: '/ndvi', ikon: 'uydu' },
      { ad: 'Su tasarrufu raporu', rota: '/tasarruf', ikon: 'rapor' },
      { ad: 'Üretim planı', rota: '/uretim-plani', ikon: 'plan' },
      { ad: 'Toprak türleri', rota: '/toprak-turleri', ikon: 'toprak' },
      { ad: 'Hatırlatıcılar', rota: '/hatirlaticilar', ikon: 'zil' },
      { ad: 'Cihazlarım', rota: '/cihazlar', ikon: 'cihaz' },
    ],
  },
  {
    baslik: 'Hesap',
    ogeler: [
      { ad: 'Hesabım ve ayarlar', rota: '/ayarlar', ikon: 'hesap' },
      { ad: 'Görsel kaynakları', rota: '/gorsel-kaynaklari', ikon: 'haber' },
      { ad: 'Veri cüzdanı', rota: '/veri-cuzdani', ikon: 'cuzdan' },
      { ad: 'ÇKS ve bağlantılar', rota: '/entegrasyonlar', ikon: 'baglanti' },
    ],
  },
];

/**
 * Sağdan açılan yan menü: üstte marka, altında araziler (dokununca seçili arazi değişir) ve tüm sayfalar.
 */
export function YanMenu({
  acik,
  kapat,
  araziler,
  seciliId,
  araziSec,
}: {
  acik: boolean;
  kapat: () => void;
  araziler: FieldDto[];
  seciliId: string | null;
  araziSec: (id: string) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gen = Math.min(width * 0.86, 380);
  const x = useRef(new Animated.Value(gen)).current;
  useEffect(() => {
    if (acik) {
      x.setValue(gen);
      Animated.timing(x, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [acik, gen, x]);
  const git = (rota: string) => {
    kapat();
    if (rota !== '/') router.push(rota as never);
  };
  return (
    <Modal
      visible={acik}
      transparent
      animationType="fade"
      onRequestClose={kapat}
      statusBarTranslucent
    >
      <Pressable
        style={s.perde}
        onPress={kapat}
        accessibilityRole="button"
        accessibilityLabel="Menüyü kapat"
      />
      <Animated.View
        style={[s.panel, { width: gen, transform: [{ translateX: x }] }]}
        testID="yan-menu"
      >
        <View style={[s.ust, { paddingTop: insets.top + 18 }]}>
          <Image
            source={IMAGE_FILES['amblem.png'] as number}
            style={s.amblem}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={s.marka}>Tarım Pusula</Text>
            <Text style={s.slogan}>Bilinçli Tarım, Verimli Üretim</Text>
          </View>
          <Pressable
            onPress={kapat}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            style={s.kapat}
          >
            <Svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              stroke="#FFFFFF"
              strokeWidth={2.2}
              strokeLinecap="round"
            >
              <Path d="M6 6l12 12M18 6L6 18" />
            </Svg>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={s.grup}>Arazilerim</Text>
          {araziler.map((f) => {
            const sec = f.id === seciliId;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityState={{ selected: sec }}
                testID="menu-arazi"
                onPress={() => {
                  araziSec(f.id);
                  kapat();
                }}
                style={[s.satir, sec && s.secili]}
              >
                <Ikon ad="arazi" renk={sec ? '#FFFFFF' : YESIL} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.ad, sec && { color: '#FFFFFF' }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={[s.alt, sec && { color: '#CFE7E2' }]} numberOfLines={1}>
                    {[f.district, f.province].filter(Boolean).join(', ')}
                  </Text>
                </View>
                {sec ? (
                  <Svg width={18} height={18} viewBox="0 0 24 24">
                    <Circle cx={12} cy={12} r={10} fill={ALTIN} />
                    <Path
                      d="M7 12l3 3 7-7"
                      stroke="#FFFFFF"
                      strokeWidth={2.4}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </Svg>
                ) : null}
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => git('/tarla-ekle')} style={s.satir}>
            <Ikon ad="ekle" />
            <Text style={s.ad}>Yeni arazi ekle</Text>
          </Pressable>
          {MENU.map((g) => (
            <View key={g.baslik}>
              <View style={s.ayrac} />
              <Text style={[s.grup, g.vurgulu && { color: '#B7791F' }]}>{g.baslik}</Text>
              {g.ogeler.map((o) => (
                <Pressable
                  key={o.rota}
                  accessibilityRole="button"
                  testID={`menu-${o.rota.replace(/\//g, '') || 'ana'}`}
                  onPress={() => git(o.rota)}
                  style={[s.satir, g.vurgulu && s.yzSatir]}
                >
                  <Ikon ad={o.ikon} renk={g.vurgulu ? '#B7791F' : YESIL} />
                  <Text style={[s.ad, { flex: 1 }]}>{o.ad}</Text>
                  {o.etiket ? <Text style={s.etiket}>{o.etiket}</Text> : null}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  perde: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    overflow: 'hidden',
  },
  ust: {
    backgroundColor: YESIL,
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amblem: { width: 46, height: 46 },
  marka: { fontFamily: fontFamily.extrabold, fontSize: 22, color: '#FFFFFF', letterSpacing: -0.3 },
  slogan: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: '#F3D58B', marginTop: 2 },
  kapat: { padding: 6 },
  grup: {
    fontFamily: fontFamily.extrabold,
    fontSize: 12,
    letterSpacing: 0.8,
    color: '#7B948F',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
    marginHorizontal: 20,
  },
  satir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 12,
  },
  secili: { backgroundColor: '#1F7A6D' },
  yzSatir: { backgroundColor: '#FFF6E0' },
  ad: { fontFamily: fontFamily.semibold, fontSize: 16, color: '#14302D' },
  alt: { fontFamily: fontFamily.medium, fontSize: 12.5, color: '#64807B', marginTop: 1 },
  etiket: {
    fontFamily: fontFamily.extrabold,
    fontSize: 12,
    color: '#7A4B00',
    backgroundColor: '#F3D58B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    overflow: 'hidden',
  },
  ayrac: { height: 1, backgroundColor: '#E6EDEB', marginHorizontal: 20, marginTop: 10 },
});
