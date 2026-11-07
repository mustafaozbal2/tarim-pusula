import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  colors,
  Durum,
  elevation,
  fontFamily,
  fontSize,
  homeColors,
  radius,
} from '@tarim/ui';
import type { MyQuestionDto } from '../src/api/client';
import { IMAGE_FILES } from '../src/assets';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { tr } from '../src/i18n/tr';
import { withDeadline } from '../src/load/deadline';
import { api } from '../src/session';
import { shortDate } from '../src/staff/useYukle';

const t = tr.myQuestions;

/** Çiftçinin uzmana soruları: bekleyen / cevaplanan; cevap ve dayanağı burada okunur (G24). */
export default function Sorularim() {
  const router = useRouter();
  const [items, setItems] = useState<MyQuestionDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await withDeadline(api.myQuestions()));
      void api.inboxRead().catch(() => undefined);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen title={t.title}>
      <View style={styles.hero}>
        <Image source={IMAGE_FILES['ikon_uzman.png'] as number} style={styles.heroIcon} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroTitle}>{t.hero}</Text>
          <Text style={styles.heroSub}>{t.sub}</Text>
        </View>
      </View>
      {items === null && !failed ? <Iskelet /> : null}
      {failed ? <YuklemeHatasi onRetry={() => void load()} /> : null}
      {items?.length === 0 ? <Durum kind="bos" text={t.empty} /> : null}
      <View style={{ gap: 10 }} testID="sorularim-listesi">
        {items?.map((q) => {
          const done = q.status === 'cevaplandi';
          return (
            <View key={q.id} style={styles.card} testID={`sorum-${q.id}`}>
              <View style={[styles.tag, done && styles.tagDone]}>
                <Text style={[styles.tagText, done && { color: '#FFFFFF' }]}>
                  {done ? t.answered : q.assigned ? t.assigned : t.waiting}
                </Text>
              </View>
              <Text style={styles.question}>{q.question}</Text>
              <Text style={styles.date}>{shortDate(q.createdAt)}</Text>
              {done && q.answer ? (
                <View style={styles.answer}>
                  <Text style={styles.answerTitle}>{t.answer}</Text>
                  <Text style={styles.answerText}>{q.answer}</Text>
                  {q.answerSource ? (
                    <Text style={styles.date}>
                      {t.source}: {q.answerSource}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {!done && q.aiAnswer ? (
                <View style={styles.answer} testID="nuvia-gecici-cevap">
                  <Text style={styles.answerTitle}>{t.aiAnswer}</Text>
                  <Text style={styles.answerText}>{q.aiAnswer}</Text>
                  {q.aiSource ? (
                    <Text style={styles.date}>
                      {t.source}: {q.aiSource}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Button label={t.ask} onPress={() => router.push('/soru-sor')} />
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
  heroIcon: { width: 60, height: 60 },
  heroTitle: { fontFamily: fontFamily.extrabold, fontSize: 18, color: homeColors.text },
  heroSub: { fontFamily: fontFamily.semibold, fontSize: 13, color: homeColors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 14,
    gap: 6,
    ...elevation.card,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagDone: { backgroundColor: homeColors.tabSelected },
  tagText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.amberText },
  question: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: homeColors.text },
  date: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  answer: { backgroundColor: colors.pistachio, borderRadius: 12, padding: 10, gap: 4 },
  answerTitle: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.forest },
  answerText: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: homeColors.text },
});
