import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as RNImage, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Button,
  Card,
  colors,
  elevation,
  fontFamily,
  homeColors,
  radius,
  spacing,
} from '@tarim/ui';
import { IMAGE_FILES } from '../../src/assets';
import { Bolum, IkonKart } from '../../src/components/Gorsel';
import type { FieldDto, PusulaCardDto } from '../../src/api/client';
import { useSettings } from '../../src/settings';
import { BilgiKarti } from '../../src/components/BilgiKarti';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';
import { kv } from '../../src/offline/kvStore';
import { cardTone, errorKey, sourceLine, speechText } from '../../src/pusula/model';
import { captionQuestion } from '../../src/pusula/model';
import { listen } from '../../src/pusula/voice';
import { voiceMessage } from '../../src/pusula/voiceTypes';
import { api } from '../../src/session';
import { FIELDS_CACHE, SELECTED } from '../../src/today/load';

const t = tr.ask;

type Image = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };
type State =
  | { s: 'idle' }
  | { s: 'photo'; image: Image }
  | { s: 'busy'; label: string }
  | { s: 'done'; card: PusulaCardDto }
  | { s: 'fail'; msg: string };

export default function AskScreen() {
  const [state, setState] = useState<State>({ s: 'idle' });
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [fieldId, setFieldId] = useState<string | undefined>();
  /** G23.13: soru hangi arazi için? Birden çok arazide çiftçi seçer; "Genel soru" araziye bağlanmaz. */
  const [fields, setFields] = useState<FieldDto[]>([]);
  const settings = useSettings();
  const guide = useRef(settings.voiceGuide);
  guide.current = settings.voiceGuide;

  useEffect(() => {
    void kv.get(SELECTED).then((id) => {
      if (id) setFieldId(id);
    });
    void kv.get(FIELDS_CACHE).then((raw) => {
      if (raw) setFields((JSON.parse(raw) as { fields: FieldDto[] }).fields);
    });
    void api.fields().then(setFields, () => undefined);
    return () => void Speech.stop();
  }, []);

  const ask = useCallback(
    async (question: string, image?: Image) => {
      const q = question.trim();
      if (!q) return;
      setShowWhy(false);
      setNote(null);
      setState({ s: 'busy', label: image ? t.photoSent : t.thinking });
      try {
        const r = await api.pusulaAsk({
          question: q,
          ...(fieldId ? { fieldId } : {}),
          ...(image ? { image } : {}),
        });
        setState({ s: 'done', card: r.card });
        // Ses rehberi açıksa cevap kendiliğinden sesli okunur (Ayarlar).
        if (guide.current) {
          setSpeaking(true);
          Speech.speak(speechText(r.card), {
            language: 'tr-TR',
            onDone: () => setSpeaking(false),
            onStopped: () => setSpeaking(false),
            onError: () => setSpeaking(false),
          });
        }
      } catch (e) {
        setState({ s: 'fail', msg: t[errorKey(e)] });
      }
    },
    [fieldId],
  );

  const voice = async () => {
    setNote(t.voiceListening);
    const outcome = await listen();
    setNote(voiceMessage(outcome, t.voiceIssues));
    if (outcome.kind === 'text') void ask(outcome.text);
  };

  const photo = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setNote(t.photoDenied);
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.4,
    });
    const a = r.canceled ? undefined : r.assets[0];
    if (!a?.base64) return;
    const mime =
      a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
    // Fotoğrafın altına açıklama yazılır; sonra gönderilir.
    setNote(null);
    setState({ s: 'photo', image: { mime, base64: a.base64 } });
  };

  const speak = (card: PusulaCardDto) => {
    if (speaking) {
      void Speech.stop();
      return setSpeaking(false);
    }
    setSpeaking(true);
    Speech.speak(speechText(card), {
      language: 'tr-TR',
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const reset = () => {
    void Speech.stop();
    setSpeaking(false);
    setState({ s: 'idle' });
    setText('');
  };

  if (state.s === 'busy') {
    return (
      <Screen title={t.title}>
        <Text style={styles.subtitle} testID="soru-bekle">
          {state.label}
        </Text>
      </Screen>
    );
  }

  if (state.s === 'photo') {
    const img = state.image;
    return (
      <Screen title={t.photoTitle}>
        <RNImage
          source={{ uri: `data:${img.mime};base64,${img.base64}` }}
          style={styles.preview}
          resizeMode="cover"
          accessibilityLabel={t.photoPreview}
          testID="foto-onizleme"
        />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.captionPlaceholder}
          accessibilityLabel={t.captionPlaceholder}
          multiline
          maxLength={500}
          style={styles.input}
          testID="foto-aciklama"
        />
        <Button
          label={t.sendPhoto}
          testID="foto-gonder"
          onPress={() => void ask(captionQuestion(text), img)}
        />
        <Button label={t.cancelPhoto} variant="secondary" onPress={reset} />
      </Screen>
    );
  }

  if (state.s === 'done') {
    const c = state.card;
    const tone = cardTone(c);
    return (
      <Screen title={c.title}>
        <Card style={[styles.card, tone === 'stop' && styles.stop, tone === 'warn' && styles.warn]}>
          <View testID="pusula-karti">
            {c.steps.map((s, i) => (
              <Text key={i} style={styles.step}>
                {i + 1}. {s}
              </Text>
            ))}
            {c.steps.length === 0 ? <Text style={styles.step}>{c.why}</Text> : null}
            {c.kind === 'handoff' ? <Text style={styles.muted}>{t.expertAsked}</Text> : null}
          </View>
          {c.sources.map((s, i) => (
            <View key={i} style={styles.sourceRow}>
              <Text style={styles.source}>
                {t.source}: {sourceLine(s)}
              </Text>
            </View>
          ))}
        </Card>
        {c.steps.length > 0 ? (
          <Button label={t.why} variant="secondary" onPress={() => setShowWhy((v) => !v)} />
        ) : null}
        {showWhy ? <Text style={styles.muted}>{c.why}</Text> : null}
        <Button
          label={speaking ? t.stopSpeak : t.speak}
          variant="secondary"
          onPress={() => speak(c)}
        />
        <Button label={t.again} onPress={reset} />
      </Screen>
    );
  }

  return (
    <Screen title={t.title}>
      <View style={styles.hero}>
        <RNImage source={IMAGE_FILES['ikon_uzman.png'] as number} style={styles.heroIcon} />
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>{t.heroTitle}</Text>
          <Text style={styles.heroSub}>{t.subtitle}</Text>
        </View>
      </View>

      <Bolum title={t.whichField}>
        <View style={styles.chips} testID="soru-arazi">
          {fields.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityState={{ selected: f.id === fieldId }}
              accessibilityLabel={f.name}
              onPress={() => setFieldId(f.id)}
              style={[styles.chip, f.id === fieldId && styles.chipOn]}
            >
              <Text style={[styles.chipText, f.id === fieldId && styles.chipTextOn]}>{f.name}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: fieldId === undefined }}
            accessibilityLabel={t.general}
            onPress={() => setFieldId(undefined)}
            style={[styles.chip, fieldId === undefined && styles.chipOn]}
          >
            <Text style={[styles.chipText, fieldId === undefined && styles.chipTextOn]}>
              {t.general}
            </Text>
          </Pressable>
        </View>
      </Bolum>

      {state.s === 'fail' ? <Text style={styles.error}>{state.msg}</Text> : null}
      {note ? <Text style={styles.muted}>{note}</Text> : null}

      <Bolum title={t.how3}>
        <IkonKart wide icon="mic" title={t.voice} hint={t.voiceHint} onPress={() => void voice()} />
        <IkonKart
          wide
          icon="camera"
          title={t.photo}
          hint={t.photoHint}
          onPress={() => void photo()}
        />
        {typing ? (
          <Card style={styles.card}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t.placeholder}
              accessibilityLabel={t.placeholder}
              multiline
              maxLength={500}
              style={styles.input}
              testID="soru-girdi"
            />
            <Button label={t.send} onPress={() => void ask(text)} />
          </Card>
        ) : (
          <IkonKart
            wide
            icon="book"
            title={t.type}
            hint={t.typeHint}
            onPress={() => setTyping(true)}
          />
        )}
      </Bolum>

      <Bolum title={t.frequent}>
        {t.questions.map((q) => (
          <Pressable
            key={q}
            accessibilityRole="button"
            accessibilityLabel={q}
            onPress={() => void ask(q)}
            style={({ pressed }) => [styles.faq, pressed && styles.pressed]}
          >
            <View style={styles.faqDot}>
              <Text style={styles.faqMark}>?</Text>
            </View>
            <Text style={styles.faqText}>{q}</Text>
          </Pressable>
        ))}
      </Bolum>
      <BilgiKarti title={t.howTitle} lines={[...t.how]} testID="pusula-nasil" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: homeColors.band,
    borderRadius: radius.card,
    padding: 14,
    ...elevation.raised,
  },
  heroIcon: { width: 68, height: 68 },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { fontFamily: fontFamily.extrabold, fontSize: 18, color: homeColors.text },
  heroSub: { fontFamily: fontFamily.medium, fontSize: 14, color: homeColors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  chipTextOn: { color: '#FFFFFF' },
  faq: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  pressed: { opacity: 0.85 },
  faqDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.pistachio,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqMark: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  faqText: { flex: 1, fontFamily: fontFamily.bold, fontSize: 15, color: colors.forest },
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.textMuted },
  preview: { width: '100%', height: 220, borderRadius: 10, backgroundColor: colors.card },
  section: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.forest, marginTop: 8 },
  card: { gap: spacing.md },
  stop: { borderColor: colors.brick, borderWidth: 2, backgroundColor: colors.brickSoft },
  warn: { borderColor: colors.amber, borderWidth: 2, backgroundColor: colors.amberSoft },
  step: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.forest, marginBottom: 8 },
  muted: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.brick },
  sourceRow: { gap: 6 },
  source: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textMuted },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.forest,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
});
