import { SekmeAnahtari } from '@tarim/ui';
import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, homeColors, radius } from '@tarim/ui';
import type { QueueItemDto } from '../../src/api/client';
import { Alan, GirisNot, Onay, useIslem } from '../../src/components/Giris';
import {
  Bolum,
  Bos,
  Etiket,
  KucukDugme,
  YetkiliEkran,
  Yukleniyor,
  yetkiliText,
} from '../../src/components/Yetkili';
import { tr } from '../../src/i18n/tr';
import { api } from '../../src/session';
import { shortDate, useYukle } from '../../src/staff/useYukle';

const t = tr.staff;

const where = (q: { province: string | null; district: string | null }) =>
  [q.province, q.district].filter(Boolean).join(' / ');

/** Tek soru: fotoğraf (varsa), cevap formu (dayanak zorunlu; doz yazılmaz). */
function SoruKarti({ q, onDone }: { q: QueueItemDto; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [source, setSource] = useState('');
  const [cacheable, setCacheable] = useState(false);
  const { busy, error, run, setError } = useIslem();

  const expand = () => {
    setOpen(true);
    if (q.hasImage && !img) {
      api.questionImage(q.id).then(
        (r) => r && setImg(`data:${r.mime};base64,${r.base64}`),
        () => undefined,
      );
    }
  };
  const send = () => {
    if (answer.trim().length < 3 || source.trim().length < 3) return setError(t.answerMissing);
    void run(async () => {
      await api.answerQuestion(q.id, {
        answer: answer.trim(),
        source: source.trim(),
        cacheable,
      });
      onDone();
    });
  };

  return (
    <Bolum
      testID={`soru-${q.id}`}
      right={<Etiket label={q.mine ? t.assignedToMe : t.open} tone={q.mine ? 'uyari' : 'normal'} />}
    >
      <Text style={yetkiliText.body}>{q.question}</Text>
      <Text style={yetkiliText.muted}>
        {where(q) ? `${t.where}: ${where(q)}` : ''}
        {q.cropName ? ` · ${t.crop}: ${q.cropName}` : ''} · {shortDate(q.createdAt)}
      </Text>
      {open ? (
        <>
          {img ? (
            <Image
              source={{ uri: img }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={t.photoAttached}
            />
          ) : null}
          <Text style={yetkiliText.label}>{t.answer}</Text>
          <TextInput
            testID={`cevap-${q.id}`}
            accessibilityLabel={t.answer}
            value={answer}
            onChangeText={setAnswer}
            multiline
            style={styles.area}
          />
          <Text style={yetkiliText.muted}>{t.answerHint}</Text>
          <Alan
            label={t.source}
            value={source}
            onChangeText={setSource}
            hint={t.sourceHint}
            testID={`kaynak-${q.id}`}
          />
          <Onay checked={cacheable} onChange={setCacheable}>
            {t.cacheable}
          </Onay>
          {error ? <GirisNot>{error}</GirisNot> : null}
          <View style={{ flexDirection: 'row' }}>
            <KucukDugme label={t.send} busy={busy} testID={`gonder-${q.id}`} onPress={send} />
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          <KucukDugme label={t.reply} testID={`ac-${q.id}`} onPress={expand} />
        </View>
      )}
    </Bolum>
  );
}

/** Gelen sorular: bölgenden sana yönlendirilenler ve açık sorular; cevapladıkların ayrı sekmede. */
export default function Sorular() {
  const [tab, setTab] = useState<'bekleyen' | 'cevaplanan'>('bekleyen');
  const queue = useYukle(() => api.expertQueue());
  const answered = useYukle(() => api.expertAnswered());
  const [msg, setMsg] = useState<string | null>(null);
  const reload = () => {
    queue.reload();
    answered.reload();
  };
  const cur = tab === 'bekleyen' ? queue : answered;
  return (
    <YetkiliEkran
      title={t.questions}
      onRefresh={reload}
      refreshing={cur.loading && !!cur.data}
      testID="yetkili-sorular-ekran"
    >
      <SekmeAnahtari
        options={[
          { key: 'bekleyen', label: `${t.waiting} (${queue.data?.length ?? 0})` },
          { key: 'cevaplanan', label: t.answered },
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg ? <GirisNot tone="bilgi">{msg}</GirisNot> : null}
      {cur.loading && !cur.data ? <Yukleniyor /> : null}
      {cur.error ? <GirisNot>{t.loadError}</GirisNot> : null}
      {cur.data?.length === 0 ? <Bos>{t.empty}</Bos> : null}
      {tab === 'bekleyen'
        ? queue.data?.map((q) => (
            <SoruKarti
              key={q.id}
              q={q}
              onDone={() => {
                setMsg(t.sent);
                reload();
              }}
            />
          ))
        : answered.data?.map((a) => (
            <Bolum key={a.id}>
              <Text style={yetkiliText.label}>{a.question}</Text>
              <Text style={yetkiliText.body}>{a.answer}</Text>
              <Text style={yetkiliText.muted}>
                {t.source}: {a.answerSource} · {where(a)} · {shortDate(a.answeredAt)}
              </Text>
            </Bolum>
          ))}
    </YetkiliEkran>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.card },
  area: {
    minHeight: 110,
    textAlignVertical: 'top',
    borderRadius: radius.row,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    backgroundColor: colors.surface,
    padding: 12,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.forest,
  },
});
