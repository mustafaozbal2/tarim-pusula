import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Button, colors, fontFamily, fontSize, radius } from '@tarim/ui';
import {
  FlowHeader,
  FlowScreen,
  Notice,
  subtitleStyle,
  titleStyle,
} from '../../src/components/FlowParts';
import { defaultFieldName, problems, toFieldPayload } from '../../src/flow/draft';
import { resetDraft, updateDraft, useDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { UrunSecici } from '../../src/components/UrunSecici';
import { queue } from '../../src/session';

const t = tr.flow;

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
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

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
        {t.cropTitle}
      </Text>
      <UrunSecici
        value={draft.cropId ?? null}
        onChange={(id, name) => {
          setPicked(name);
          updateDraft((d) => ({ ...d, cropId: id }));
        }}
      />

      {draft.cropId ? (
        <Text style={subtitleStyle} testID="secilen-urun">
          {picked ?? tr.commonCrops.find((c) => c.id === draft.cropId)?.name ?? draft.cropId}
        </Text>
      ) : null}
      {missing && !draft.cropId ? <Notice tone="warn">{t.cropMissing}</Notice> : null}

      <Text style={subtitleStyle}>{t.fieldName}</Text>
      <TextInput
        accessibilityLabel={t.fieldName}
        testID="tarla-adi"
        value={draft.name ?? defaultFieldName(draft)}
        onChangeText={(name: string) => updateDraft((d) => ({ ...d, name }))}
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
    </FlowScreen>
  );
}
