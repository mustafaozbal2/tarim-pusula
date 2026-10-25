import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BigChoice, Button, colors, fontFamily, fontSize, radius } from '@tarim/ui';
import {
  FlowHeader,
  FlowScreen,
  Notice,
  subtitleStyle,
  titleStyle,
} from '../../src/components/FlowParts';
import type { CropDto } from '../../src/api/client';
import { defaultFieldName, problems, toFieldPayload } from '../../src/flow/draft';
import { resetDraft, updateDraft, useDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { api, queue } from '../../src/session';

const t = tr.flow;

const fold = (s: string) =>
  s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

/** Ne ekili? Yaygın 6 ürün büyük kutu; "Diğer…" ile bütün ürünler. Kaydet → sıraya al, gönder. */
export default function CropScreen() {
  const router = useRouter();
  const draft = useDraft();
  const [crops, setCrops] = useState<CropDto[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.crops().then(setCrops, () => setCrops(null)); // çevrimdışıyken yerleşik 6 ürün gösterilir
  }, []);

  const common = useMemo(
    () =>
      crops
        ? crops.filter((c) => c.commonRank !== null).map((c) => ({ id: c.id, name: c.nameTr }))
        : [...tr.commonCrops],
    [crops],
  );
  const list = (crops ?? []).filter((c) => !search || fold(c.nameTr).includes(fold(search)));

  async function save() {
    if (problems(draft).includes('urun')) return setMissing(true);
    setBusy(true);
    const id = uuid();
    const payload = toFieldPayload(draft);
    await queue.enqueue(
      draft.claimCode
        ? { id, kind: 'claim', code: draft.claimCode, payload, queuedAt: new Date().toISOString() }
        : { id, kind: 'field', payload, queuedAt: new Date().toISOString() },
    );
    const outcomes = await queue.flush();
    setBusy(false);
    const mine = outcomes.find((o) => o.id === id);
    if (mine?.result === 'rejected') {
      setMessage(draft.claimCode ? tr.fields.claimRejected : mine.message);
      return;
    }
    const sent = mine?.result === 'sent';
    const text = !sent ? tr.fields.queued : draft.claimCode ? tr.fields.claimSent : tr.fields.sent;
    resetDraft();
    router.dismissTo({ pathname: '/tarlalarim', params: { bilgi: text } });
  }

  return (
    <FlowScreen
      footer={
        <>
          {message ? <Notice tone="warn">{message}</Notice> : null}
          <Button
            label={busy ? t.saving : t.save}
            onPress={busy ? undefined : () => void save()}
            style={{ minHeight: 48 }}
          />
        </>
      }
    >
      <FlowHeader step={t.step2} />
      <Text accessibilityRole="header" style={titleStyle}>
        {showAll ? t.cropAll : t.cropTitle}
      </Text>

      {showAll ? (
        <>
          <TextInput
            accessibilityLabel={t.cropSearch}
            testID="urun-ara"
            value={search}
            onChangeText={setSearch}
            placeholder={t.cropSearch}
            style={{
              minHeight: 44,
              borderRadius: radius.row,
              borderWidth: 1,
              borderColor: colors.forest,
              backgroundColor: colors.surface,
              paddingHorizontal: 16,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.body,
              color: colors.forest,
            }}
          />
          {list.map((c) => (
            <BigChoice
              key={c.id}
              title={c.nameTr}
              selected={draft.cropId === c.id}
              onPress={() => {
                updateDraft((d) => ({ ...d, cropId: c.id }));
                setShowAll(false);
              }}
            />
          ))}
        </>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {common.map((c) => {
            const selected = draft.cropId === c.id;
            return (
              <Pressable
                key={c.id}
                testID={`urun-${c.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => updateDraft((d) => ({ ...d, cropId: c.id }))}
                style={{
                  width: '47.5%',
                  minHeight: 56,
                  borderRadius: radius.card,
                  borderWidth: 2,
                  borderColor: colors.forest,
                  backgroundColor: selected ? colors.pistachio : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamily.extrabold,
                    fontSize: 17,
                    color: colors.forest,
                    textAlign: 'center',
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            testID="urun-diger"
            accessibilityRole="button"
            onPress={() => setShowAll(true)}
            style={{
              width: '47.5%',
              minHeight: 56,
              borderRadius: radius.card,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.forest,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: fontFamily.extrabold, fontSize: 17, color: colors.forest }}>
              {t.cropOther}
            </Text>
          </Pressable>
        </View>
      )}

      {draft.cropId && !showAll ? (
        <Text style={subtitleStyle} testID="secilen-urun">
          {crops?.find((c) => c.id === draft.cropId)?.nameTr ??
            tr.commonCrops.find((c) => c.id === draft.cropId)?.name}
        </Text>
      ) : null}
      {missing && !draft.cropId ? <Notice tone="warn">{t.cropMissing}</Notice> : null}

      {!showAll ? (
        <>
          <Text style={subtitleStyle}>{t.fieldName}</Text>
          <TextInput
            accessibilityLabel={t.fieldName}
            testID="tarla-adi"
            value={draft.name ?? defaultFieldName(draft)}
            onChangeText={(name) => updateDraft((d) => ({ ...d, name }))}
            style={{
              minHeight: 44,
              borderRadius: radius.row,
              borderWidth: 1,
              borderColor: colors.forest,
              backgroundColor: colors.surface,
              paddingHorizontal: 16,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.body,
              color: colors.forest,
            }}
          />
        </>
      ) : null}
    </FlowScreen>
  );
}
