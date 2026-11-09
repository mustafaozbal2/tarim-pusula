import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, homeColors } from '@tarim/ui';
import { useSuzulme } from '../design/Gecis';
import { tr } from '../i18n/tr';
import { expoLocation } from '../location/expoLocation';
import { kv } from '../offline/kvStore';
import { listen } from '../pusula/voice';
import { useSettings } from '../settings';
import { konus, konusuyor, sustur } from './konus';
import { voiceMessage } from '../pusula/voiceTypes';
import { api, queue } from '../session';
import { videoAdresi, videoKucuk } from './medya';
import type { Eylem } from './niyet';
import { gercekOrtam } from './ortam';
import {
  SORU_UYARISI,
  ben,
  ilerle,
  robot,
  type Durum,
  type Kart,
  type Mesaj,
  type Secenek,
} from './sohbet';
import { Robot } from './Robot';

const t = tr.asistan;

/** Karşılama balonu uygulama açıldıktan sonra her seferinde bir kez, birkaç saniye görünür. */
let selamVerildi = false;
const SELAM_MS = 8_000;

const BASLANGIC: Secenek[] = [
  { etiket: 'Tarla ekle', deger: 'tarla ekle' },
  { etiket: 'Hava durumu', deger: 'hava durumu' },
  { etiket: 'İş takvimi', deger: 'iş takvimim' },
  { etiket: 'Uzmana sor', deger: 'uzmana sor' },
];

/**
 * Ana sayfanın sağ altında yeşil robot. Açılışta kısa bir karşılama balonu çıkar. Dokununca küçük bir sohbet
 * kartı açılır: çiftçi yazarak ya da konuşarak ister; robot sayfa değiştirmeden arka planda işi yapar
 * (tarla ekleme, hava, takvim) ve sorulara kaynaklı cevap, video ve fotoğraf getirir.
 */
export function AsistanDugmesi() {
  const [open, setOpen] = useState(false);
  const [selam, setSelam] = useState(false);
  const float = useSuzulme(4, 2800);
  const bottom = useSafeAreaInsets().bottom + 14;
  const balon = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (selamVerildi) return;
    const timers = [
      setTimeout(() => {
        selamVerildi = true;
        setSelam(true);
      }, 1200),
      setTimeout(() => setSelam(false), 1200 + SELAM_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    Animated.timing(balon, {
      toValue: selam ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [selam, balon]);

  const ac = () => {
    setSelam(false);
    setOpen(true);
  };
  return (
    <>
      <View style={[styles.dock, { bottom }]} pointerEvents="box-none">
        <Animated.View
          pointerEvents={selam ? 'auto' : 'none'}
          style={[
            styles.bubble,
            {
              opacity: balon,
              transform: [
                { translateY: balon.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
              ],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.hello}
            onPress={ac}
            style={styles.bubbleHit}
          >
            <Text style={styles.bubbleText}>{t.hello}</Text>
          </Pressable>
          <View style={styles.bubbleTail} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: float }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.open}
            testID="asistan-ac"
            onPress={ac}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Robot size={52} id="robot-fab" />
          </Pressable>
        </Animated.View>
      </View>
      <SohbetKarti open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function KartGorunumu({ k }: { k: Kart }) {
  if (k.tur === 'video') {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Video: ${k.video.baslik}`}
        testID="sohbet-video"
        onPress={() => void Linking.openURL(videoAdresi(k.video.id))}
        style={styles.video}
      >
        <Image
          source={{ uri: videoKucuk(k.video.id) }}
          style={styles.videoImg}
          resizeMode="cover"
        />
        <View style={styles.videoText}>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {k.video.baslik}
          </Text>
          <Text style={styles.small} numberOfLines={1}>
            {k.video.kanal} · YouTube
          </Text>
        </View>
      </Pressable>
    );
  }
  if (k.tur === 'gorsel') {
    return (
      <View style={styles.gorsel} testID="sohbet-gorsel">
        <Image source={{ uri: k.gorsel.adres }} style={styles.gorselImg} resizeMode="cover" />
        <Text style={styles.small}>{k.gorsel.baslik}</Text>
        <Text style={styles.atif}>Fotoğraf: {k.gorsel.atif}</Text>
      </View>
    );
  }
  if (k.tur === 'baglanti') {
    return (
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(k.adres)}
        style={styles.baglanti}
      >
        <Text style={styles.baglantiText}>{k.baslik}</Text>
      </Pressable>
    );
  }
  return <Text style={styles.kaynak}>Kaynak: {k.satir}</Text>;
}

function SohbetKarti({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ortam = useMemo(() => gercekOrtam({ api, kv, queue, konum: expoLocation }), []);
  const [mesajlar, setMesajlar] = useState<Mesaj[]>(() => [
    robot('Hoş geldiniz efendim! Size nasıl yardımcı olabilirim?', { secenekler: BASLANGIC }),
  ]);
  const [durum, setDurum] = useState<Durum>({ k: 'bos' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dinle, setDinle] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const ayar = useSettings();
  // Ses rehberi açıksa ya da çiftçi sesle sorduysa robot cevabı sesli okur (Nuvia'nın kadın sesi; olmazsa cihaz sesi).
  const sesli = useRef(false);
  sesli.current = !!ayar.voiceGuide;
  const sesleSordu = useRef(false);
  useEffect(() => () => sustur(), []);
  useEffect(() => {
    if (!open) sustur();
  }, [open]);

  const gonder = async (gosterilen: string, deger = gosterilen) => {
    const q = deger.trim();
    if (!q || busy) return;
    setText('');
    setBusy(true);
    // Eski mesajlardaki seçenekler artık gösterilmez (yalnız sonuncunun düğmeleri kalır).
    setMesajlar((m) => [...m.map((x) => ({ ...x, secenekler: undefined })), ben(gosterilen)]);
    try {
      const a = await ilerle(durum, q, ortam);
      setDurum(a.durum);
      setMesajlar((m) => [...m, ...a.mesajlar]);
      const okunacak = a.mesajlar.find((x) => x.kimden === 'robot' && x.metin);
      if (okunacak && (sesli.current || sesleSordu.current)) void konus(okunacak.metin, api);
      sesleSordu.current = false;
    } catch {
      setMesajlar((m) => [...m, robot('Bir sorun çıktı. Biraz sonra yeniden dener misin?')]);
    } finally {
      setBusy(false);
    }
  };

  const sesle = async () => {
    if (dinle || busy) return;
    // MP-5d: robot konuşurken kayıt başlarsa kendi sesini duyup kendini algılar; önce sus, yankı dinsin.
    if (konusuyor()) {
      sustur();
      await new Promise((r) => setTimeout(r, 450));
    } else {
      sustur();
    }
    setDinle(true);
    const r = await listen();
    setDinle(false);
    if (r.kind === 'text') {
      sesleSordu.current = true;
      void gonder(r.text);
    } else {
      const m = voiceMessage(r, tr.ask.voiceIssues);
      if (m) setMesajlar((x) => [...x, robot(m)]);
    }
  };

  const git = (e: Eylem) => {
    onClose();
    router.push(e.route as never);
  };

  const sonId = mesajlar[mesajlar.length - 1]?.id;
  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [sonId, busy]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t.close}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
        <View
          style={[styles.sheet, { paddingBottom: 14 + insets.bottom, maxHeight: height * 0.88 }]}
          testID="asistan-panel"
        >
          <View style={styles.grip} />
          <View style={styles.head}>
            <View style={styles.headRobot}>
              <Robot size={40} id="robot-panel" />
            </View>
            <View style={styles.headText}>
              <Text style={styles.name}>{t.name}</Text>
              <Text style={styles.role}>{t.role}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.close}
              onPress={onClose}
              style={styles.close}
            >
              <Text style={styles.closeText}>{t.close}</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scroll}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            testID="asistan-cevap"
          >
            {mesajlar.map((m) => (
              <View key={m.id} style={m.kimden === 'robot' ? styles.rowRobot : styles.rowBen}>
                <View style={m.kimden === 'robot' ? styles.say : styles.me}>
                  <Text style={m.kimden === 'robot' ? styles.sayText : styles.meText}>
                    {m.metin}
                  </Text>
                  {m.kartlar?.map((k, i) => (
                    <KartGorunumu key={i} k={k} />
                  ))}
                  {m.eylem ? (
                    <Pressable
                      accessibilityRole="button"
                      testID="asistan-git"
                      onPress={() => git(m.eylem!)}
                      style={styles.goBtn}
                    >
                      <Text style={styles.goText}>{`${m.eylem.label}: ${t.go}`}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {m.secenekler?.length ? (
                  <View style={styles.chips}>
                    {m.secenekler.map((s) => (
                      <Pressable
                        key={s.deger}
                        accessibilityRole="button"
                        accessibilityLabel={s.etiket}
                        testID="asistan-secenek"
                        onPress={() => void gonder(s.etiket, s.deger)}
                        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                      >
                        <Text style={styles.chipText}>{s.etiket}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            {busy ? (
              <View style={styles.rowRobot}>
                <View style={styles.say}>
                  <Text style={styles.sayText}>Yazıyor…</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={dinle ? tr.ask.voiceListening : t.placeholder}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t.placeholder}
              testID="asistan-yaz"
              onSubmitEditing={() => void gonder(text)}
              returnKeyType="send"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sesle söyle"
              testID="asistan-mikrofon"
              onPress={() => void sesle()}
              style={[styles.mic, dinle && styles.micOn]}
            >
              <Text style={[styles.micText, dinle && { color: '#FFFFFF' }]}>Ses</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.send}
              testID="asistan-gonder"
              onPress={() => void gonder(text)}
              style={[styles.send, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.sendText}>{t.send}</Text>
            </Pressable>
          </View>
          <Text style={styles.rule} testID="asistan-uyari">
            {SORU_UYARISI}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', right: 14, bottom: 14, alignItems: 'flex-end' },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#BFEBD3',
    shadowColor: '#0E3B2C',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: { transform: [{ scale: 0.95 }] },
  bubble: {
    maxWidth: 230,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 10,
    marginRight: 6,
    shadowColor: '#0E3B2C',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleHit: { minHeight: 44, justifyContent: 'center' },
  bubbleText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  bubbleTail: {
    position: 'absolute',
    right: 24,
    bottom: -6,
    width: 14,
    height: 14,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,36,30,0.45)',
  },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 10,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  grip: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D3E6E3' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headRobot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  role: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted },
  close: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: fontFamily.bold, fontSize: 14, color: homeColors.tabSelected },
  list: { flexGrow: 0 },
  listContent: { gap: 10, paddingVertical: 4 },
  rowRobot: { alignItems: 'flex-start', gap: 8 },
  rowBen: { alignItems: 'flex-end' },
  say: {
    maxWidth: '92%',
    backgroundColor: '#E8F8EF',
    borderRadius: 18,
    borderTopLeftRadius: 6,
    padding: 12,
    gap: 8,
  },
  sayText: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 21, color: '#16503F' },
  me: {
    maxWidth: '85%',
    backgroundColor: colors.forest,
    borderRadius: 18,
    borderTopRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  meText: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 21, color: '#FFFFFF' },
  goBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.forest,
    justifyContent: 'center',
  },
  goText: { fontFamily: fontFamily.bold, fontSize: 15, color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  chipPressed: { backgroundColor: colors.pistachio },
  chipText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  video: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 64,
  },
  videoImg: { width: 112, height: 72, backgroundColor: '#D3E6E3' },
  videoText: { flex: 1, justifyContent: 'center', paddingRight: 8, gap: 2 },
  videoTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.forest },
  gorsel: { gap: 4, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 6 },
  gorselImg: { width: '100%', aspectRatio: 16 / 10, borderRadius: 8, backgroundColor: '#D3E6E3' },
  small: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  atif: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  baglanti: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    backgroundColor: '#FFFFFF',
  },
  baglantiText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  kaynak: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    paddingHorizontal: 16,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.forest,
  },
  mic: {
    minHeight: 48,
    minWidth: 52,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOn: { backgroundColor: colors.brick, borderColor: colors.brick },
  micText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.forest },
  send: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: colors.forest,
    justifyContent: 'center',
  },
  sendText: { fontFamily: fontFamily.bold, fontSize: 15, color: '#FFFFFF' },
  rule: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
});
