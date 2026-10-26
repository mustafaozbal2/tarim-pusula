import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Button,
  Card,
  colors,
  Durum,
  fontFamily,
  fontSize,
  homeColors,
  Rozet,
  SekmeAnahtari,
} from '@tarim/ui';
import { IMAGE_FILES } from '../../src/assets';
import { SayfaGorseli } from '../../src/components/Gorsel';
import type { DeviceDto, FieldDto } from '../../src/api/client';
import FieldMap from '../../src/components/FieldMap';
import { BilgiKarti, OzetKarolari } from '../../src/components/BilgiKarti';
import { Notice } from '../../src/components/FlowParts';
import { PendingProposals } from '../../src/components/Proposals';
import { Screen } from '../../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../../src/components/Yukleme';
import { withDeadline } from '../../src/load/deadline';
import { resetDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { kv } from '../../src/offline/kvStore';
import type { QueueItem } from '../../src/offline/queue';
import { api, queue } from '../../src/session';

const t = tr.fields;
const tf = tr.fieldsScreen;
type View2 = 'liste' | 'harita';
const CACHE_KEY = 'cache.fields.v1';

interface Cache {
  at: string;
  fields: FieldDto[];
}

export default function FieldsScreen() {
  const router = useRouter();
  const { bilgi } = useLocalSearchParams<{ bilgi?: string }>();
  const [cache, setCache] = useState<Cache | null>(null);
  const [offline, setOffline] = useState(false);
  /** İlk yükleme bitti mi (veri, önbellek ya da hata). Bitmeden boş durum gösterilmez. */
  const [settled, setSettled] = useState(false);
  const [waiting, setWaiting] = useState<QueueItem[]>([]);
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [view, setView] = useState<View2>('liste');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropNames, setCropNames] = useState<Record<string, string>>({});
  useEffect(() => {
    api.crops().then(
      (list) => setCropNames(Object.fromEntries(list.map((c) => [c.id, c.nameTr]))),
      () => undefined,
    );
  }, []);

  const load = useCallback(async () => {
    setWaiting(await queue.pending());
    const raw = await kv.get(CACHE_KEY);
    if (raw) setCache(JSON.parse(raw) as Cache);
    try {
      // En geç 10 sn: ağ yavaşsa son liste ve "son güncelleme" saati görünür.
      const fields = await withDeadline(
        (async () => {
          await queue.flush();
          setWaiting(await queue.pending());
          return api.fields();
        })(),
      );
      const fresh = { at: new Date().toISOString(), fields };
      await kv.set(CACHE_KEY, JSON.stringify(fresh));
      setCache(fresh);
      setOffline(false);
      setDevices(await api.devices().catch(() => []));
    } catch {
      setOffline(true); // son kaydedilen liste kalır, "son güncelleme" saati görünür
    } finally {
      setSettled(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Arka planda gönderim bitince liste kendiliğinden yenilenir.
  useEffect(() => queue.subscribe(() => void load()), [load]);

  const empty = (cache?.fields.length ?? 0) === 0 && waiting.length === 0;
  const fieldsShown = (cache?.fields ?? []).filter((f) =>
    `${f.name} ${f.village ?? ''} ${f.district ?? ''} ${f.province ?? ''}`
      .toLocaleLowerCase('tr-TR')
      .includes(query.trim().toLocaleLowerCase('tr-TR')),
  );
  const totalArea = (cache?.fields ?? [])
    .reduce((sum, f) => sum + (f.areaDecare ?? 0), 0)
    .toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  const selected = cache?.fields.find((f) => f.id === selectedId) ?? cache?.fields[0] ?? null;
  const center =
    selected && selected.lat !== null && selected.lon !== null
      ? { lat: selected.lat, lon: selected.lon }
      : { lat: 38.5, lon: 35.5 };
  const hasPoint = selected !== null && selected.lat !== null;

  return (
    <Screen title={t.title}>
      <SayfaGorseli image="genis_tarla.jpg" text={tf.hero} />
      {bilgi ? <Notice>{bilgi}</Notice> : null}
      <PendingProposals onChanged={() => void load()} />
      <OzetKarolari
        items={[
          { label: tf.statFields, value: String(cache?.fields.length ?? 0) },
          { label: tf.statArea, value: totalArea },
          { label: tf.statDevices, value: String(devices.length) },
        ]}
      />
      <SekmeAnahtari<View2>
        testID="tarla-gorunum"
        value={view}
        onChange={setView}
        options={[
          { key: 'liste', label: tf.list },
          { key: 'harita', label: tf.map },
        ]}
      />
      {view === 'harita' ? (
        <Card style={styles.mapCard} testID="tarla-harita">
          {hasPoint ? (
            <View style={styles.map}>
              <FieldMap center={center} zoom={11} marker={center} onPick={() => undefined} />
            </View>
          ) : (
            <Durum kind="bos" text={tf.mapHint} />
          )}
          <Text style={styles.detail}>
            {tf.selected}: {selected?.name ?? '-'}
          </Text>
        </Card>
      ) : null}
      <TextInput
        accessibilityLabel={tf.search}
        placeholder={tf.search}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />
      {waiting.map((w) => (
        <Card key={w.id} style={styles.card}>
          <Text style={styles.name}>
            {w.kind === 'field-update'
              ? (w.patch.name ?? cache?.fields.find((f) => f.id === w.fieldId)?.name ?? '')
              : w.payload.name}
          </Text>
          <Rozet label={t.waiting} />
        </Card>
      ))}
      {fieldsShown.map((f) => (
        <Card
          key={f.id}
          style={[styles.card, selected?.id === f.id && { borderColor: colors.forest }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${tf.selected}: ${f.name}`}
            onPress={() => setSelectedId(f.id)}
            style={styles.head}
          >
            <View style={styles.no}>
              <Text style={styles.noText}>{(cache?.fields.indexOf(f) ?? 0) + 1}</Text>
            </View>
            <Image source={IMAGE_FILES['ikon_tarla.png'] as number} style={styles.pic} />
            <View style={styles.headText}>
              <Text style={styles.name} testID="tarla-karti">
                {f.name}
              </Text>
              <Text style={styles.detail}>
                {[f.village, f.district, f.province].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.cropLine}>
                {cropNames[f.cropId ?? ''] ??
                  tr.commonCrops.find((c) => c.id === f.cropId)?.name ??
                  tr.ndvi.notSet}
                {f.areaDecare
                  ? ` · ${f.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${t.area}`
                  : ''}
              </Text>
            </View>
          </Pressable>
          <View style={styles.actions}>
            <Button
              label={tr.ndvi.open}
              variant="secondary"
              style={styles.action}
              onPress={() => router.push({ pathname: '/ndvi', params: { fieldId: f.id } })}
            />
            <Button
              label={tr.calendar.open}
              variant="secondary"
              style={styles.action}
              onPress={() => router.push({ pathname: '/takvim', params: { fieldId: f.id } })}
            />
          </View>
          <Button
            label={tf.edit}
            variant="secondary"
            testID="tarla-guncelle"
            onPress={() => router.push({ pathname: '/arazi-duzenle', params: { fieldId: f.id } })}
          />
          {devices
            .filter((d) => d.fieldId === f.id)
            .map((d) => (
              <Button
                key={d.id}
                label={`${tr.irrigation.openValve}: ${d.name}`}
                variant="water"
                onPress={() => router.push({ pathname: '/sulama', params: { deviceId: d.id } })}
              />
            ))}
        </Card>
      ))}
      {!empty && fieldsShown.length === 0 && query ? <Durum kind="bos" text={tf.noMatch} /> : null}
      {!settled && !cache ? <Iskelet rows={2} /> : null}
      {empty && settled && !(offline && !cache) ? (
        <Durum kind="bos" text={`${t.empty} ${t.emptyHint}`} />
      ) : null}
      {offline && !cache ? <YuklemeHatasi onRetry={() => void load()} /> : null}
      {offline ? <Notice tone="warn">{t.offlineNote}</Notice> : null}
      <Button
        label={t.add}
        onPress={() => {
          resetDraft();
          router.push('/tarla-ekle');
        }}
      />
      <BilgiKarti title={tf.howTitle} lines={[...tf.how]} testID="arazi-nasil" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  no: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: homeColors.band,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noText: { fontFamily: fontFamily.extrabold, fontSize: 15, color: homeColors.text },
  pic: { width: 54, height: 54 },
  headText: { flex: 1, gap: 2 },
  cropLine: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  mapCard: { gap: 6, padding: 6 },
  map: { height: 190, borderRadius: 8, overflow: 'hidden' },
  name: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  detail: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  search: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.forest,
  },
});
