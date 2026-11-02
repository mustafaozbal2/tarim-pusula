import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, homeColors } from '@tarim/ui';
import { useSuzulme } from '../design/Gecis';
import { tr } from '../i18n/tr';
import { kv } from '../offline/kvStore';
import { varsayilanBeyin } from './beyin';
import { EYLEMLER, HIZLI, type Eylem } from './niyet';
import { Robot } from './Robot';

const t = tr.asistan;
const SELAM_KEY = 'asistan.selam.v1';

/**
 * Ana sayfanın sağ altında yeşil robot (asistan). İlk açılışta bir kez "Ne yapmak istersin?" balonu
 * çıkar. Dokununca panel açılır: hızlı seçenekler ve yazarak istek. İstek bir ekrana karşılık
 * geliyorsa oraya götürür; bilmiyorsa uydurmaz, uzmana yönlendirir.
 */
export function AsistanDugmesi() {
  const [open, setOpen] = useState(false);
  const [selam, setSelam] = useState(false);
  const float = useSuzulme(4, 2800);
  // Telefonun alt gezinme çubuğunun üstünde dursun.
  const bottom = useSafeAreaInsets().bottom + 14;
  const balon = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void kv
      .get(SELAM_KEY)
      .catch(() => null)
      .then((v) => {
        if (!alive || v) return;
        timers.push(
          setTimeout(() => {
            setSelam(true);
            void kv.set(SELAM_KEY, '1').catch(() => undefined);
          }, 1200),
        );
        timers.push(setTimeout(() => alive && setSelam(false), 10_000));
      });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    Animated.timing(balon, {
      toValue: selam ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [selam, balon]);

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
            onPress={() => {
              setSelam(false);
              setOpen(true);
            }}
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
            onPress={() => {
              setSelam(false);
              setOpen(true);
            }}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Robot size={52} id="robot-fab" />
          </Pressable>
        </Animated.View>
      </View>
      <AsistanPaneli open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AsistanPaneli({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const beyin = useMemo(() => varsayilanBeyin(), []);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ say: string; eylem: Eylem | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  const go = (e: Eylem) => {
    onClose();
    setReply(null);
    setText('');
    router.push(e.route as never);
  };
  const ask = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    const e = await beyin.anla(q);
    setBusy(false);
    setReply(e ? { say: e.say, eylem: e } : { say: t.unknown, eylem: EYLEMLER['uzmana-sor'] });
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t.close}
      />
      <KeyboardAvoidingView
        // Modal içinde Android pencereyi küçültmez: iki platformda da alttan dolgu.
        behavior="padding"
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]} testID="asistan-panel">
          <View style={styles.grip} />
          <View style={styles.head}>
            <View style={styles.headRobot}>
              <Robot size={54} id="robot-panel" />
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

          <View style={styles.say} testID="asistan-cevap">
            <Text style={styles.sayText}>{reply ? reply.say : t.intro}</Text>
            {reply?.eylem ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${reply.eylem.label} ${t.go}`}
                testID="asistan-git"
                onPress={() => go(reply.eylem!)}
                style={styles.goBtn}
              >
                <Text style={styles.goText}>
                  {reply.eylem.key === 'uzmana-sor' && reply.say === t.unknown
                    ? t.askExpert
                    : `${reply.eylem.label}: ${t.go}`}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.chips}>
            {HIZLI.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityLabel={EYLEMLER[k].label}
                testID={`asistan-hizli-${k}`}
                onPress={() => go(EYLEMLER[k])}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text style={styles.chipText}>{EYLEMLER[k].label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t.placeholder}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t.placeholder}
              testID="asistan-yaz"
              onSubmitEditing={() => void ask()}
              returnKeyType="send"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.send}
              testID="asistan-gonder"
              onPress={() => void ask()}
              style={[styles.send, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.sendText}>{t.send}</Text>
            </Pressable>
          </View>
          <Text style={styles.rule}>{t.rule}</Text>
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
    maxWidth: 220,
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
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 14,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  grip: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D3E6E3',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headRobot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  role: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted },
  close: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: fontFamily.bold, fontSize: 14, color: homeColors.tabSelected },
  say: {
    backgroundColor: '#E8F8EF',
    borderRadius: 18,
    borderTopLeftRadius: 6,
    padding: 14,
    gap: 10,
  },
  sayText: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 21, color: '#16503F' },
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
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
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
  send: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: colors.forest,
    justifyContent: 'center',
  },
  sendText: { fontFamily: fontFamily.bold, fontSize: 15, color: '#FFFFFF' },
  rule: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
});
