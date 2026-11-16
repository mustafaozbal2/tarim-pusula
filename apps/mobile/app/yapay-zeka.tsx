import { hedefRef } from '../src/tanitim/hedef';
import { YardimDugmesi } from '../src/tanitim/YardimDugmesi';
import { DusunmeNoktalari, ZiplayanRobot } from '../src/asistan/ZiplayanRobot';
import { Robot } from '../src/asistan/Robot';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { fontFamily } from '@tarim/ui';
import { KartGorunumu } from '../src/asistan/Asistan';
import { gercekOrtam } from '../src/asistan/ortam';
import { ben, ilerle, robot, SORU_UYARISI, type Durum, type Mesaj } from '../src/asistan/sohbet';
import { konus, sustur } from '../src/asistan/konus';
import { expoLocation } from '../src/location/expoLocation';
import { kv } from '../src/offline/kvStore';
import { listen } from '../src/pusula/voice';
import { voiceMessage } from '../src/pusula/voiceTypes';
import { api, queue } from '../src/session';
import { tr } from '../src/i18n/tr';
import { baslikUret, sohbetKaydet, sohbetleriOku, sohbetSil, type Sohbet } from '../src/yz/gecmis';

const YESIL = '#0E3B37';
const yeniId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const ilkMesaj = () =>
  robot(
    'Merhaba, ben Nuvia; Tarım Pusula’nın yapay zekâsıyım. Tarlanla ilgili her şeyi sorabilirsin: hava, don, sulama, budama, hastalık. Bitkinin fotoğrafını çekip gönderirsen bakarım.',
  );

/** Sohbet boşken robotun altında çıkan hazır sorular: dokununca yazılmış gibi gönderilir. */
const HAZIR_SORULAR = [
  'Bu gece don var mı?',
  'Bugün sulamam gerekir mi?',
  'Bu hafta hava nasıl olacak?',
  'Tarlama ne eksem?',
  'Açık hibe ve destekler neler?',
  'Yeni tarla eklemek istiyorum',
];

function Ikon({ d, renk = YESIL, boy = 22 }: { d: string; renk?: string; boy?: number }) {
  return (
    <Svg
      width={boy}
      height={boy}
      viewBox="0 0 24 24"
      fill="none"
      stroke={renk}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={d} />
    </Svg>
  );
}
const KAMERA = 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const GALERI = 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01';
const MIK = 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3';
const GONDER = 'M4 12l16-8-6 16-2-7z';
const GECMIS = 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2';
const YENI = 'M12 5v14M5 12h14';
const GERI = 'M15 5l-7 7 7 7';

/**
 * Tam ekran yapay zekâ: geçmiş sohbetler (telefonda saklanır), yazılı/sesli soru, fotoğraf çek ya da seç.
 * Cevaplar Pusula (kaynaklı) + Nuvia ile gelir; doz vermez, uzman cevabı değildir (altta sabit uyarı).
 */
export default function YapayZekaEkrani() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ortam = useMemo(() => gercekOrtam({ api, kv, queue, konum: expoLocation }), []);
  const [sohbet, setSohbet] = useState<Sohbet>(() => ({
    id: yeniId(),
    baslik: '',
    zaman: new Date().toISOString(),
    mesajlar: [ilkMesaj()],
  }));
  const [durum, setDurum] = useState<Durum>({ k: 'bos' });
  const [liste, setListe] = useState<Sohbet[]>([]);
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [yazi, setYazi] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const [dinliyor, setDinliyor] = useState(false);
  const [foto, setFoto] = useState<{
    mime: 'image/jpeg' | 'image/png' | 'image/webp';
    base64: string;
  } | null>(null);
  /** Bildirilmek üzere seçilen robot cevabı (neden seçenekleri o balonun altında açılır) ve bildirilenler. */
  const [bildirilen, setBildirilen] = useState<Mesaj['id'] | null>(null);
  const [bildirildi, setBildirildi] = useState<Record<string, 'tamam' | 'hata'>>({});
  const bildirimAnahtari = (m: Mesaj) => String(m.id);
  const bildir = async (m: Mesaj, neden: 'yanlis' | 'sakincali' | 'zararli') => {
    setBildirilen(null);
    try {
      const r = await api.robotBildir({ mesaj: m.metin.slice(0, 2000), neden });
      setBildirildi((b) => ({ ...b, [bildirimAnahtari(m)]: r.alindi ? 'tamam' : 'hata' }));
    } catch {
      setBildirildi((b) => ({ ...b, [bildirimAnahtari(m)]: 'hata' }));
    }
  };
  const kaydir = useRef<ScrollViewInstance>(null);
  const sesleSordu = useRef(false);

  useEffect(() => {
    void sohbetleriOku(kv).then(setListe);
    return () => sustur();
  }, []);
  useEffect(() => {
    // Sohbet boşken (yalnız karşılama) en üstte kalır: zıplayan robot ve hazır sorular görünsün.
    const bos = !sohbet.mesajlar.some((m) => m.kimden === 'ben');
    const t = setTimeout(
      () =>
        bos
          ? kaydir.current?.scrollTo({ y: 0, animated: false })
          : kaydir.current?.scrollToEnd({ animated: true }),
      80,
    );
    return () => clearTimeout(t);
  }, [sohbet.mesajlar.length, mesgul]);

  const ekle = async (yeni: Mesaj[]) => {
    let son: Sohbet | null = null;
    setSohbet((s) => {
      const mesajlar = [...s.mesajlar.map((m) => ({ ...m, secenekler: undefined })), ...yeni];
      son = {
        ...s,
        mesajlar,
        zaman: new Date().toISOString(),
        baslik: s.baslik || baslikUret(mesajlar),
      };
      return son;
    });
    await new Promise((r) => setTimeout(r, 0));
    if (son && (son as Sohbet).mesajlar.some((m) => m.kimden === 'ben'))
      setListe(await sohbetKaydet(kv, son));
  };

  const gonder = async (metin: string) => {
    const q = metin.trim();
    if ((!q && !foto) || mesgul) return;
    setYazi('');
    setMesgul(true);
    const f = foto;
    setFoto(null);
    try {
      if (f) {
        await ekle([
          {
            ...ben(q || 'Bu fotoğrafa bakar mısın?'),
            gorsel: `data:${f.mime};base64,${f.base64}`,
            fotoNotu: true,
          },
        ]);
        const tarla = await ortam.urunKimligi().catch(() => null);
        const r = await api.robotFoto({ soru: q || null, urun: tarla, gorsel: f });
        await ekle([robot(r.cevap)]);
        if (sesleSordu.current) void konus(r.cevap, api);
      } else {
        await ekle([ben(q)]);
        const a = await ilerle(durum, q, ortam);
        setDurum(a.durum);
        await ekle(a.mesajlar);
        const ilk = a.mesajlar.find((m) => m.kimden === 'robot' && m.metin);
        if (ilk && sesleSordu.current) void konus(ilk.metin, api);
      }
    } catch {
      await ekle([
        robot('Şu an cevap alamadım. İnternet bağlantını kontrol edip tekrar dener misin?'),
      ]);
    } finally {
      sesleSordu.current = false;
      setMesgul(false);
    }
  };

  const fotoAl = async (kamera: boolean) => {
    const izin = kamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!izin.granted) {
      await ekle([
        robot(
          kamera
            ? 'Kamera izni verilmedi. Ayarlardan izin verirsen fotoğraf çekebilirsin.'
            : 'Galeri izni verilmedi.',
        ),
      ]);
      return;
    }
    const secenek = {
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      base64: true,
      quality: 0.4,
    };
    const r = kamera
      ? await ImagePicker.launchCameraAsync(secenek)
      : await ImagePicker.launchImageLibraryAsync(secenek);
    const a = r.canceled ? undefined : r.assets[0];
    if (!a?.base64) return;
    if (a.base64.length > 1_250_000) {
      await ekle([
        robot('Fotoğraf çok büyük. Biraz uzaktan, daha küçük çekip tekrar dener misin?'),
      ]);
      return;
    }
    const mime =
      a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
    setFoto({ mime, base64: a.base64 });
  };

  const sesle = async () => {
    if (mesgul || dinliyor) return;
    sustur();
    setDinliyor(true);
    const r = await listen();
    setDinliyor(false);
    if (r.kind === 'text') {
      sesleSordu.current = true;
      void gonder(r.text);
    } else {
      const m = voiceMessage(r, tr.ask.voiceIssues);
      if (m) await ekle([robot(m)]);
    }
  };

  const yeniSohbet = () => {
    sustur();
    setSohbet({
      id: yeniId(),
      baslik: '',
      zaman: new Date().toISOString(),
      mesajlar: [ilkMesaj()],
    });
    setDurum({ k: 'bos' });
    setGecmisAcik(false);
  };

  return (
    <View style={[s.kok, { paddingTop: insets.top }]} testID="yapay-zeka">
      <View style={s.ust}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri"
          onPress={() => router.back()}
          style={s.ustDugme}
        >
          <Ikon d={GERI} renk="#FFFFFF" />
        </Pressable>
        <View style={s.ustRobot}>
          <Robot size={32} id="robot-yz-ust" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.baslik}>Nuvia</Text>
          <Text style={s.altBaslik} numberOfLines={1}>
            {sohbet.baslik || 'Pusula yapay zekâ · yeni sohbet'}
          </Text>
        </View>
        <YardimDugmesi boyut={32} />
        <Pressable
          ref={hedefRef('yz.gecmis')}
          accessibilityRole="button"
          accessibilityLabel="Geçmiş sohbetler"
          testID="yz-gecmis"
          onPress={() => setGecmisAcik(true)}
          style={s.ustDugme}
        >
          <Ikon d={GECMIS} renk="#FFFFFF" />
        </Pressable>
        <Pressable
          ref={hedefRef('yz.yeni')}
          accessibilityRole="button"
          accessibilityLabel="Yeni sohbet"
          testID="yz-yeni"
          onPress={yeniSohbet}
          style={s.ustDugme}
        >
          <Ikon d={YENI} renk="#FFFFFF" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={kaydir}
          style={{ flex: 1 }}
          contentContainerStyle={s.akis}
          keyboardShouldPersistTaps="handled"
          testID="yz-mesajlar"
        >
          {/* Sohbet boşken: ortada zıplayan Nuvia ve dokunulabilir hazır sorular. */}
          {!sohbet.mesajlar.some((m) => m.kimden === 'ben') ? (
            <View style={s.karsilama} testID="yz-karsilama">
              <View ref={hedefRef('yz.robot')} collapsable={false}>
                <ZiplayanRobot size={104} />
              </View>
              <Text style={s.karsilamaBaslik}>Merhaba, ben Nuvia</Text>
              <Text style={s.karsilamaAlt}>
                Tarım Pusula’nın yapay zekâsıyım. Hava, don, sulama, budama, hastalık: ne istersen
                sor. Yazabilir, konuşabilir ya da bitkinin fotoğrafını gönderebilirsin.
              </Text>
              <View ref={hedefRef('yz.hazir')} style={s.hazirlar}>
                {HAZIR_SORULAR.map((q) => (
                  <Pressable
                    key={q}
                    accessibilityRole="button"
                    accessibilityLabel={q}
                    testID="yz-hazir-soru"
                    onPress={() => void gonder(q)}
                    style={({ pressed }) => [s.hazir, pressed && s.hazirBasili]}
                  >
                    <Text style={s.hazirYazi}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {/* Sohbet boşken karşılama balonu çizilmez: aynı selam yukarıda robotun altında yazıyor. */}
          {(sohbet.mesajlar.length === 1 && sohbet.mesajlar[0]!.kimden === 'robot'
            ? []
            : sohbet.mesajlar
          ).map((m) => (
            <View key={m.id} style={m.kimden === 'robot' ? s.satirRobot : s.satirBen}>
              {m.kimden === 'robot' ? (
                <View style={s.avatar}>
                  <Robot size={24} id={`robot-m-${m.id}`} />
                </View>
              ) : null}
              <View style={m.kimden === 'robot' ? s.balonRobot : s.balonBen}>
                {m.gorsel ? (
                  <Image source={{ uri: m.gorsel }} style={s.foto} resizeMode="cover" />
                ) : null}
                {!m.gorsel && m.fotoNotu ? (
                  <Text style={s.fotoNot}>[Fotoğraf gönderildi]</Text>
                ) : null}
                <Text style={m.kimden === 'robot' ? s.yaziRobot : s.yaziBen}>{m.metin}</Text>
                {m.kartlar?.map((k, i) => (
                  <KartGorunumu key={i} k={k} />
                ))}
                {m.eylem ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(m.eylem!.route as never)}
                    style={s.git}
                  >
                    <Text style={s.gitYazi}>{`${m.eylem.label}: aç`}</Text>
                  </Pressable>
                ) : null}
                {/* Play politikası: yapay zekâ cevabı uygulama içinden bildirilebilir. Karşılama mesajı hariç. */}
                {m.kimden === 'robot' && sohbet.mesajlar[0]?.id !== m.id ? (
                  bildirildi[bildirimAnahtari(m)] ? (
                    <Text style={s.bildirNot} testID="yz-bildirildi">
                      {bildirildi[bildirimAnahtari(m)] === 'tamam'
                        ? 'Teşekkürler, bildirimin alındı. Ekibimiz inceleyecek.'
                        : 'Bildirim gönderilemedi. Bağlantını kontrol edip yeniden dene.'}
                    </Text>
                  ) : bildirilen === m.id ? (
                    <View style={s.bildirSecenekler} testID="yz-bildir-nedenler">
                      <Text style={s.bildirSoru}>Bu cevapta sorun ne?</Text>
                      {(
                        [
                          ['yanlis', 'Bilgi yanlış'],
                          ['sakincali', 'Uygunsuz içerik'],
                          ['zararli', 'Zarar verebilir'],
                        ] as const
                      ).map(([k, ad]) => (
                        <Pressable
                          key={k}
                          accessibilityRole="button"
                          accessibilityLabel={ad}
                          testID={`yz-bildir-${k}`}
                          onPress={() => void bildir(m, k)}
                          style={s.bildirNeden}
                        >
                          <Text style={s.bildirNedenYazi}>{ad}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Bu cevabı bildir"
                      testID="yz-bildir"
                      onPress={() => setBildirilen(m.id)}
                      style={s.bildir}
                    >
                      <Text style={s.bildirYazi}>Cevabı bildir</Text>
                    </Pressable>
                  )
                ) : null}
                {m.secenekler?.length ? (
                  <View style={s.secenekler}>
                    {m.secenekler.map((o) => (
                      <Pressable
                        key={o.deger}
                        accessibilityRole="button"
                        onPress={() => void gonder(o.deger)}
                        style={s.secenek}
                      >
                        <Text style={s.secenekYazi}>{o.etiket}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ))}
          {mesgul ? (
            <View style={s.satirRobot} testID="yz-dusunuyor">
              <View style={s.avatar}>
                <Robot size={24} id="robot-dusunen" />
              </View>
              <View style={[s.balonRobot, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <Text style={s.yaziRobot}>Düşünüyorum</Text>
                <DusunmeNoktalari />
              </View>
            </View>
          ) : null}
        </ScrollView>

        {foto ? (
          <View style={s.onizleme}>
            <Image
              source={{ uri: `data:${foto.mime};base64,${foto.base64}` }}
              style={s.onizlemeFoto}
            />
            <Text style={s.onizlemeYazi}>
              Fotoğraf eklendi. İstersen bir soru yaz, sonra gönder.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setFoto(null)}>
              <Text style={s.kaldir}>Kaldır</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[s.alt, { paddingBottom: insets.bottom + 8 }]}>
          <View style={s.giris} ref={hedefRef('yz.giris')}>
            <Pressable
              ref={hedefRef('yz.kamera')}
              accessibilityRole="button"
              accessibilityLabel="Fotoğraf çek"
              testID="yz-kamera"
              onPress={() => void fotoAl(true)}
              style={s.ikonDugme}
            >
              <Ikon d={KAMERA} />
            </Pressable>
            <Pressable
              ref={hedefRef('yz.galeri')}
              accessibilityRole="button"
              accessibilityLabel="Galeriden seç"
              onPress={() => void fotoAl(false)}
              style={s.ikonDugme}
            >
              <Ikon d={GALERI} />
            </Pressable>
            <TextInput
              value={yazi}
              onChangeText={setYazi}
              placeholder={dinliyor ? 'Dinliyorum…' : 'Bir şey sor…'}
              placeholderTextColor="#7B948F"
              style={s.kutu}
              multiline
              maxLength={600}
              testID="yz-yaz"
            />
            {yazi.trim() || foto ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Gönder"
                testID="yz-gonder"
                onPress={() => void gonder(yazi)}
                style={[s.gonder, mesgul && { opacity: 0.5 }]}
              >
                <Ikon d={GONDER} renk="#FFFFFF" />
              </Pressable>
            ) : (
              <Pressable
                ref={hedefRef('yz.ses')}
                accessibilityRole="button"
                accessibilityLabel="Sesle sor"
                testID="yz-ses"
                onPress={() => void sesle()}
                style={[s.gonder, dinliyor && { backgroundColor: '#B23A2B' }]}
              >
                <Ikon d={MIK} renk="#FFFFFF" />
              </Pressable>
            )}
          </View>
          <Text style={s.uyari} ref={hedefRef('yz.uyari')}>
            {SORU_UYARISI}
          </Text>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={gecmisAcik}
        animationType="slide"
        transparent
        onRequestClose={() => setGecmisAcik(false)}
      >
        <View style={s.perde}>
          <View style={[s.gecmis, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.gecmisUst}>
              <Text style={s.gecmisBaslik}>Geçmiş sohbetler</Text>
              <Pressable accessibilityRole="button" onPress={() => setGecmisAcik(false)}>
                <Text style={s.kaldir}>Kapat</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={yeniSohbet} style={s.yeniSatir}>
              <Ikon d={YENI} />
              <Text style={s.gecmisAd}>Yeni sohbet başlat</Text>
            </Pressable>
            <ScrollView>
              {liste.length === 0 ? <Text style={s.bos}>Henüz kayıtlı sohbet yok.</Text> : null}
              {liste.map((x) => (
                <View key={x.id} style={s.gecmisSatir}>
                  <Pressable
                    accessibilityRole="button"
                    style={{ flex: 1 }}
                    onPress={() => {
                      sustur();
                      setSohbet(x);
                      setDurum({ k: 'bos' });
                      setGecmisAcik(false);
                    }}
                  >
                    <Text style={s.gecmisAd} numberOfLines={1}>
                      {x.baslik}
                    </Text>
                    <Text style={s.gecmisZaman}>
                      {new Date(x.zaman).toLocaleString('tr-TR', {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sohbeti sil"
                    onPress={() => void sohbetSil(kv, x.id).then(setListe)}
                  >
                    <Text style={s.sil}>Sil</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  kok: { flex: 1, backgroundColor: '#F3F6F5' },
  ust: {
    backgroundColor: YESIL,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 3,
    borderBottomColor: '#1F7A6D',
    shadowColor: '#041F1D',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 2,
  },
  ustDugme: {
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ustRobot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E9F4F1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginRight: 6,
  },
  baslik: { fontFamily: fontFamily.extrabold, fontSize: 19, color: '#FFFFFF', letterSpacing: 0.3 },
  karsilama: { alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 8 },
  karsilamaBaslik: { fontFamily: fontFamily.extrabold, fontSize: 22, color: YESIL },
  karsilamaAlt: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    color: '#4A5F5E',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  hazirlar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 6,
  },
  // Hazır soru: kabartmalı hap düğme (alt kenarı koyu, basınca iner).
  hazir: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#BFDCD7',
    borderBottomWidth: 3.5,
    borderBottomColor: '#9CC7C0',
    shadowColor: '#1F6E6D',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  hazirBasili: {
    borderBottomWidth: 1.5,
    transform: [{ translateY: 2 }],
    backgroundColor: '#E8F4F1',
  },
  hazirYazi: { fontFamily: fontFamily.bold, fontSize: 14, color: '#1F6E6D' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E9F4F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#CFE7E3',
  },
  altBaslik: { fontFamily: fontFamily.medium, fontSize: 12.5, color: '#B2E2DA' },
  akis: { padding: 14, gap: 10, paddingBottom: 24 },
  satirRobot: { flexDirection: 'row', justifyContent: 'flex-start' },
  satirBen: { flexDirection: 'row', justifyContent: 'flex-end' },
  balonRobot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopLeftRadius: 6,
    padding: 13,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: '#DCE8E5',
    borderBottomWidth: 2.5,
    borderBottomColor: '#C9DDD9',
    shadowColor: '#1F6E6D',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  balonBen: {
    backgroundColor: '#1F7A6D',
    borderRadius: 18,
    borderTopRightRadius: 6,
    padding: 13,
    maxWidth: '82%',
    borderBottomWidth: 2.5,
    borderBottomColor: '#14574D',
  },
  yaziRobot: { fontFamily: fontFamily.medium, fontSize: 15.5, color: '#14302D', lineHeight: 22 },
  yaziBen: { fontFamily: fontFamily.semibold, fontSize: 15.5, color: '#FFFFFF', lineHeight: 22 },
  foto: { width: 220, height: 165, borderRadius: 12, marginBottom: 8 },
  fotoNot: { fontFamily: fontFamily.medium, fontSize: 12, color: '#CFE7E2', marginBottom: 4 },
  git: {
    marginTop: 10,
    backgroundColor: '#E8F4F1',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  gitYazi: { fontFamily: fontFamily.bold, fontSize: 14, color: YESIL },
  bildir: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  bildirYazi: { fontFamily: fontFamily.semibold, fontSize: 12, color: '#7B948F' },
  bildirSecenekler: {
    marginTop: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8E6',
    paddingTop: 8,
  },
  bildirSoru: { fontFamily: fontFamily.bold, fontSize: 13, color: '#14302D' },
  bildirNeden: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D8B5AE',
    backgroundColor: '#FFF6F4',
  },
  bildirNedenYazi: { fontFamily: fontFamily.bold, fontSize: 13.5, color: '#8A2E22' },
  bildirNot: { fontFamily: fontFamily.medium, fontSize: 12, color: '#4A5F5E', marginTop: 8 },
  secenekler: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  secenek: {
    borderWidth: 1.5,
    borderColor: '#1F7A6D',
    borderRadius: 99,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  secenekYazi: { fontFamily: fontFamily.bold, fontSize: 13.5, color: '#1F7A6D' },
  onizleme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8E6',
  },
  onizlemeFoto: { width: 52, height: 52, borderRadius: 10 },
  onizlemeYazi: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13, color: '#33433F' },
  kaldir: { fontFamily: fontFamily.bold, fontSize: 14, color: '#3D8E8D', padding: 6 },
  alt: { paddingHorizontal: 10, paddingTop: 8, backgroundColor: '#F3F6F5' },
  giris: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#BFDCD7',
    gap: 2,
    shadowColor: '#1F6E6D',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  ikonDugme: {
    padding: 9,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kutu: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: '#14302D',
    maxHeight: 120,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  gonder: {
    backgroundColor: '#1F7A6D',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#14574D',
  },
  uyari: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#7B948F',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 15,
  },
  perde: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  gecmis: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '80%',
    padding: 16,
  },
  gecmisUst: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gecmisBaslik: { fontFamily: fontFamily.extrabold, fontSize: 18, color: YESIL },
  yeniSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F4F1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  gecmisSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3F1',
  },
  gecmisAd: { fontFamily: fontFamily.semibold, fontSize: 15.5, color: '#14302D' },
  gecmisZaman: { fontFamily: fontFamily.medium, fontSize: 12, color: '#7B948F', marginTop: 2 },
  sil: { fontFamily: fontFamily.bold, fontSize: 13.5, color: '#B23A2B', padding: 6 },
  bos: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: '#7B948F',
    textAlign: 'center',
    padding: 20,
  },
});
