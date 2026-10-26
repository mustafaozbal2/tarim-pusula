import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Durum, FormAlani, fontFamily, fontSize, radius } from '@tarim/ui';
import type { FieldDto } from '../src/api/client';
import { Bolum, SayfaGorseli } from '../src/components/Gorsel';
import { Screen } from '../src/components/Screen';
import { UrunSecici } from '../src/components/UrunSecici';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { parseArea } from '../src/fields/area';
import { placeLine } from '../src/home/model';
import { tr } from '../src/i18n/tr';
import { withDeadline } from '../src/load/deadline';
import { kv } from '../src/offline/kvStore';
import { api, queue } from '../src/session';
import { FIELDS_CACHE, SELECTED } from '../src/today/load';

const t = tr.fieldEdit;

/**
 * Arazi güncelle / sil (G23.10). Güncelleme çevrimdışı sıraya da girer (aynı yama tekrarlanabilir);
 * silme yalnız bağlantı varken yapılır ve onay ister.
 */
export default function FieldEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fieldId?: string; sil?: string }>();
  const removing = params.sil === '1';
  const [fields, setFields] = useState<FieldDto[] | null | 'error'>(null);
  const [id, setId] = useState<string | null>(params.fieldId ?? null);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [crop, setCrop] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFields(null);
    void withDeadline(api.fields())
      .then((list) => {
        setFields(list);
        setId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(() => setFields('error'));
  }, []);
  useEffect(load, [load]);

  const list = Array.isArray(fields) ? fields : [];
  const field = list.find((f) => f.id === id) ?? null;
  useEffect(() => {
    if (!field) return;
    setName(field.name);
    setArea(field.areaDecare ? String(field.areaDecare).replace('.', ',') : '');
    setCrop(field.cropId);
    setMsg(null);
  }, [field]);

  async function save() {
    if (!field) return;
    const a = parseArea(area);
    if (a === undefined) return setMsg(t.badArea);
    setBusy(true);
    const patch = {
      name: name.trim() || field.name,
      areaDecare: a ?? undefined,
      cropId: crop ?? undefined,
    };
    const qid = `upd-${field.id}-${Date.now()}`;
    await queue.enqueue({
      id: qid,
      kind: 'field-update',
      fieldId: field.id,
      patch,
      queuedAt: new Date().toISOString(),
    });
    const out = await queue.flush();
    setBusy(false);
    const mine = out.find((o) => o.id === qid);
    if (mine?.result === 'rejected') return setMsg(mine.message);
    router.replace({
      pathname: '/tarlalarim',
      params: { bilgi: mine?.result === 'sent' ? t.saved : t.queued },
    });
  }

  async function remove() {
    if (!field) return;
    setBusy(true);
    try {
      await withDeadline(api.deleteField(field.id));
      await kv.remove(FIELDS_CACHE);
      if ((await kv.get(SELECTED)) === field.id) await kv.remove(SELECTED);
      router.replace({ pathname: '/tarlalarim', params: { bilgi: t.removed } });
    } catch {
      setMsg(t.removeFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={removing ? t.removeTitle : t.title}>
      {!removing ? <SayfaGorseli image="genis_ciftciler.jpg" text={t.hero} /> : null}
      {fields === null ? <Iskelet rows={2} /> : null}
      {fields === 'error' ? <YuklemeHatasi onRetry={load} /> : null}
      {Array.isArray(fields) && fields.length === 0 ? (
        <Durum
          kind="bos"
          text={t.noField}
          action={{ label: tr.hub.add, onPress: () => router.push('/tarla-ekle') }}
        />
      ) : null}

      {list.length > 1 ? (
        <Bolum title={t.choose}>
          <View style={styles.pickRow}>
            {list.map((f, i) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityState={{ selected: f.id === id }}
                accessibilityLabel={f.name}
                testID="duzenle-arazi"
                onPress={() => setId(f.id)}
                style={[styles.pick, f.id === id && styles.pickOn]}
              >
                <Text style={[styles.pickNo, f.id === id && styles.onText]}>{i + 1}</Text>
                <Text style={[styles.pickText, f.id === id && styles.onText]} numberOfLines={1}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </Bolum>
      ) : null}

      {field && removing ? (
        <Card style={styles.danger} testID="sil-onay">
          <Text style={styles.dangerTitle}>{field.name}</Text>
          <Text style={styles.body}>{placeLine(field)}</Text>
          <Text style={styles.body}>{t.removeAsk}</Text>
          <Button
            label={busy ? t.saving : t.removeYes}
            variant="danger"
            testID="sil-evet"
            onPress={busy ? undefined : () => void remove()}
          />
          <Button label={t.removeNo} variant="secondary" onPress={() => router.back()} />
        </Card>
      ) : null}

      {field && !removing ? (
        <>
          <Card style={styles.form}>
            <FormAlani label={t.name} value={name} onChangeText={setName} testID="duzenle-ad" />
            <FormAlani
              label={t.area}
              value={area}
              onChangeText={setArea}
              keyboardType="numeric"
              testID="duzenle-alan"
            />
          </Card>
          <Bolum title={t.crop}>
            <UrunSecici value={crop} onChange={(cid) => setCrop(cid)} />
          </Bolum>
          <Button
            label={busy ? t.saving : t.save}
            testID="duzenle-kaydet"
            onPress={busy ? undefined : () => void save()}
          />
        </>
      ) : null}
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickRow: { gap: 8 },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  pickNo: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  pickText: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest },
  onText: { color: '#FFFFFF' },
  form: { gap: 10 },
  danger: { gap: 10, borderColor: colors.brick, backgroundColor: colors.brickSoft },
  dangerTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.brick },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  msg: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.brick },
});
