import { useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, fontFamily, fontSize, homeColors, radius } from '@tarim/ui';
import { ApiError, NetworkError } from '../api/client';
import { IMAGE_FILES } from '../assets';
import { tr } from '../i18n/tr';
import { Hale, useBelirme, useSuzulme } from '../design/Gecis';
import { Icon } from './Icon';

/**
 * Giriş ekranlarının ortak zemini (G26): tam ekran fide fotoğrafı (üstte ve altta koyu yeşile yumuşak
 * geçiş fotoğrafa gömülü; scripts/tasarim-gorselleri.py), ışık halesi içinde saydam pusula amblemi (hafif süzülür) ve canlı yazı
 * "TARIM PUSULA"; içerik kabartmalı beyaz kartta aşağıdan belirir. Web'de de aynı.
 */
export function GirisZemin({
  children,
  back,
  title,
  testID,
}: {
  children: ReactNode;
  /** Geri düğmesi (alt ekranlarda). */
  back?: boolean;
  title?: string;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const float = useSuzulme(5);
  const cardIn = useBelirme(120);
  const brandIn = useBelirme(0, 10);
  const logo = back ? 92 : 148;
  return (
    <View style={styles.root} testID={testID}>
      <Image
        source={IMAGE_FILES['giris_fidan.jpg'] as number}
        style={styles.bg}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <KeyboardAvoidingView
        style={[styles.fill, styles.top]}
        // Android kenardan kenara çizilir; pencere klavyeyle küçülmez: iki platformda da alttan dolgu.
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 16) + 8 }]}
          keyboardShouldPersistTaps="handled"
        >
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr.flow.back}
              testID="giris-geri"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/giris'))}
              style={[styles.back, { top: insets.top + 6 }]}
            >
              <View style={styles.backCircle}>
                <Icon name="back" size={20} color={homeColors.text} />
              </View>
            </Pressable>
          ) : null}
          <Animated.View style={[styles.brand, brandIn]}>
            <View style={{ width: logo * 1.9, height: logo * 1.25, alignItems: 'center' }}>
              <Hale
                id="giris-hale"
                size={logo * 1.9}
                strength={0.55}
                color="#FFF6D6"
                style={{ position: 'absolute', top: -logo * 0.32 }}
              />
              {/* Yere düşen yumuşak gölge (yuvarlak, kesik kenarsız): kabartma etkisi. */}
              <Hale
                id="giris-golge-alt"
                size={logo * 0.9}
                strength={0.32}
                color="#000000"
                style={{ position: 'absolute', top: logo * 0.62, transform: [{ scaleY: 0.32 }] }}
              />
              <Animated.View style={{ transform: [{ translateY: float }] }}>
                <Image
                  source={IMAGE_FILES['amblem_yalin.png'] as number}
                  style={[styles.logo, { width: logo * 0.83, height: logo }]}
                  resizeMode="contain"
                  accessibilityLabel={tr.app.name}
                />
              </Animated.View>
            </View>
            <Text style={[styles.wordmark, back && styles.wordmarkSmall]}>
              {tr.app.name.toLocaleUpperCase('tr-TR')}
            </Text>
            {!back ? <Text style={styles.slogan}>{tr.app.slogan}</Text> : null}
          </Animated.View>
          <Animated.View style={[styles.card, cardIn]}>
            <View pointerEvents="none" style={styles.cardShine} />
            {title ? (
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
            ) : null}
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Etiketli metin kutusu; şifre alanında göster/gizle düğmesi. */
export function Alan({
  label,
  value,
  onChangeText,
  placeholder,
  secret,
  keyboardType,
  testID,
  hint,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  testID?: string;
  hint?: string;
  autoComplete?: 'tel' | 'password' | 'new-password' | 'one-time-code' | 'name' | 'off';
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secret && !show}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoComplete={autoComplete}
          style={styles.input}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={show ? tr.auth.hidePassword : tr.auth.showPassword}
            onPress={() => setShow((v) => !v)}
            style={styles.eye}
          >
            <Text style={styles.eyeText}>{show ? tr.auth.hide : tr.auth.show}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Onay kutusu (KVKK aydınlatma metni vb.). */
export function Onay({
  checked,
  onChange,
  children,
  testID,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      testID={testID}
      onPress={() => onChange(!checked)}
      style={styles.check}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <View style={styles.tick} /> : null}
      </View>
      <Text style={styles.checkText}>{children}</Text>
    </Pressable>
  );
}

/** Büyük ana düğme (giriş ekranları). */
export function GirisDugme({
  label,
  onPress,
  tone = 'ana',
  testID,
  busy,
}: {
  label: string;
  onPress: () => void;
  tone?: 'ana' | 'ikinci' | 'yazi';
  testID?: string;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      testID={testID}
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        tone === 'ana' && styles.btnMain,
        tone === 'ikinci' && styles.btnSecond,
        tone === 'yazi' && styles.btnText,
        pressed && { opacity: 0.85 },
        busy && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          styles.btnLabel,
          tone === 'ana' && { color: '#FFFFFF' },
          tone !== 'ana' && { color: colors.forest },
        ]}
      >
        {busy ? tr.auth.wait : label}
      </Text>
    </Pressable>
  );
}

/** Kısa uyarı satırı (hata/bilgi). */
export function GirisNot({
  children,
  tone = 'hata',
}: {
  children: ReactNode;
  tone?: 'hata' | 'bilgi';
}) {
  return (
    <View style={[styles.note, tone === 'bilgi' && styles.noteInfo]} accessibilityRole="alert">
      <Text style={[styles.noteText, tone === 'bilgi' && { color: colors.forest }]}>
        {children}
      </Text>
    </View>
  );
}

/** Giriş ekranlarındaki sunucu çağrısı: bekleme, hata metni, sunucuya ulaşılamadı ayrımı. */
export function useIslem() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noServer, setNoServer] = useState(false);
  async function run(fn: () => Promise<void>) {
    setError(null);
    setNoServer(false);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (e instanceof NetworkError) setNoServer(true);
      else setError(e instanceof ApiError ? e.message : String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, noServer, run, setError };
}

/** Tek seçimlik liste (kurum türü, rol). */
export function Secenekler<K extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (k: K) => void;
  testID?: string;
}) {
  return (
    <View style={styles.options}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            testID={testID ? `${testID}-${o.key}` : undefined}
            onPress={() => onChange(o.key)}
            style={[styles.option, on && styles.optionOn]}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <View style={styles.radioDot} /> : null}
            </View>
            <Text style={[styles.optionText, on && { color: colors.forest }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Yazdıkça süzülen seçim (il, ilçe): en çok 6 öneri; seçilince kutu dolar. */
export function AraSec({
  label,
  items,
  value,
  onChange,
  testID,
}: {
  label: string;
  items: string[];
  value: string;
  onChange: (v: string) => void;
  testID?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const norm = (v: string) => v.toLocaleLowerCase('tr');
  const hits = items.filter((i) => norm(i).startsWith(norm(query.trim()))).slice(0, 6);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={query}
          onFocus={() => setOpen(true)}
          onChangeText={(v) => {
            setQuery(v);
            setOpen(true);
            if (v !== value) onChange('');
          }}
          placeholder={tr.auth.choose}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>
      {open && hits.length > 0 && !(hits.length === 1 && hits[0] === value) ? (
        <View style={styles.hits}>
          {hits.map((h) => (
            <Pressable
              key={h}
              accessibilityRole="button"
              testID={testID ? `${testID}-${h}` : undefined}
              onPress={() => {
                setQuery(h);
                onChange(h);
                setOpen(false);
              }}
              style={styles.hit}
            >
              <Text style={styles.hitText}>{h}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radius.row,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: homeColors.tabSelected, backgroundColor: colors.pistachio },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: homeColors.tabSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.forest },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.forest },
  optionText: { flex: 1, fontFamily: fontFamily.bold, fontSize: 15, color: colors.textMuted },
  hits: {
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: homeColors.band,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  hitText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.forest },
  root: { flex: 1, backgroundColor: '#123B33' },
  fill: { flex: 1 },
  // İçerik fotoğrafın üstünde (web'de fotoğraf katmanı kendi yığın bağlamını kurar).
  top: { zIndex: 2 },
  bg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', padding: 16, paddingBottom: 28, gap: 14 },
  back: { position: 'absolute', top: 16, left: 12, width: 44, height: 44, zIndex: 2 },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { alignItems: 'center', gap: 2, marginBottom: 6 },
  logo: {},
  wordmark: {
    fontFamily: fontFamily.extrabold,
    fontSize: 30,
    letterSpacing: 3,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  wordmarkSmall: { fontSize: 20, letterSpacing: 2 },
  slogan: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: 0.4,
    color: '#F3E7C4',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 26,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    ...elevation.raised,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  // Kartın üst kenarında ince ışık: kabartma hissi.
  cardShine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: homeColors.band,
    opacity: 0.85,
  },
  title: { fontFamily: fontFamily.extrabold, fontSize: 21, color: colors.forest },
  field: { gap: 4 },
  label: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.row,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.forest,
  },
  eye: { minHeight: 50, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  eyeText: { fontFamily: fontFamily.bold, fontSize: 13, color: homeColors.tabSelected },
  hint: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: homeColors.tabSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: homeColors.tabSelected },
  // Çizimle işaret (emoji yok): sola yatık "L" biçimi.
  tick: {
    width: 7,
    height: 13,
    marginTop: -3,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  checkText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13, color: colors.forest },
  btn: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnMain: { backgroundColor: colors.forest, ...elevation.card },
  btnSecond: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: colors.forest },
  btnText: { minHeight: 44 },
  btnLabel: { fontFamily: fontFamily.extrabold, fontSize: 17 },
  note: {
    backgroundColor: colors.brickSoft,
    borderRadius: radius.row,
    padding: 10,
  },
  noteInfo: { backgroundColor: colors.pistachio },
  noteText: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.brick },
});
