import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as RNImage, StyleSheet, Text, TextInput, View } from 'react-native';
import { BigChoice, Button, Card, colors, fontFamily, spacing } from '@tarim/ui';
import type { PusulaCardDto } from '../../src/api/client';
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
import { SELECTED } from '../../src/today/load';

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
  const settings = useSettings();
  const guide = useRef(settings.voiceGuide);
  guide.current = settings.voiceGuide;

  useEffect(() => {
    void kv.get(SELECTED).then((id) => {
      if (id) setFieldId(id);
    });
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
      <Text style={styles.subtitle}>{t.subtitle}</Text>
      {!fieldId ? <Text style={styles.muted}>{t.noField}</Text> : null}
      {state.s === 'fail' ? <Text style={styles.error}>{state.msg}</Text> : null}
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      <Button label={t.voice} style={styles.voice} onPress={() => void voice()} />
      <Button label={t.photo} variant="secondary" onPress={() => void photo()} />
      {typing ? (
        <>
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
        </>
      ) : (
        <Button label={t.type} variant="secondary" onPress={() => setTyping(true)} />
      )}
      <Text style={styles.section}>{t.frequent}</Text>
      {t.questions.map((q) => (
        <BigChoice key={q} title={q} onPress={() => void ask(q)} />
      ))}
      <BilgiKarti title={t.howTitle} lines={[...t.how]} testID="pusula-nasil" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.textMuted },
  voice: { minHeight: 56 },
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
