import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, Durum, fontFamily, fontSize, Rozet, SekmeAnahtari } from '@tarim/ui';
import type { DeviceDto, FieldDto } from '../../src/api/client';
import FieldMap from '../../src/components/FieldMap';
import { BilgiKarti, OzetKarolari } from '../../src/components/BilgiKarti';
import { Notice } from '../../src/components/FlowParts';
import { PendingProposals } from '../../src/components/Proposals';
import { Screen } from '../../src/components/Screen';
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

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export default function FieldsScreen() {
  const router = useRouter();
  const { bilgi } = useLocalSearchParams<{ bilgi?: string }>();
  const [cache, setCache] = useState<Cache | null>(null);
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<QueueItem[]>([]);
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [view, setView] = useState<View2>('liste');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setWaiting(await queue.pending());
    const raw = await kv.get(CACHE_KEY);
    if (raw) setCache(JSON.parse(raw) as Cache);
    try {
      await queue.flush();
      setWaiting(await queue.pending());
      const fields = await api.fields();
      const fresh = { at: new Date().toISOString(), fields };
      await kv.set(CACHE_KEY, JSON.stringify(fresh));
      setCache(fresh);
      setOffline(false);
      setDevices(await api.devices().catch(() => []));
    } catch {
      setOffline(true); // son kaydedilen liste kalır, "son güncelleme" saati görünür
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
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={styles.name} testID="tarla-karti">
              {f.name}
            </Text>
            <Text style={styles.detail}>
              {[f.village, f.district, f.province].filter(Boolean).join(' · ')}
              {f.areaDecare
                ? ` · ${f.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${t.area}`
                : ''}
            </Text>
            <Text style={styles.detail}>
              {tr.ndvi.cropLabel}:{' '}
              {tr.commonCrops.find((c) => c.id === f.cropId)?.name ?? f.cropId ?? tr.ndvi.notSet}
              {f.lat !== null && f.lon !== null
                ? ` · ${f.lat.toFixed(3)}, ${f.lon.toFixed(3)}`
                : ''}
            </Text>
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
      {empty ? <Durum kind="bos" text={`${t.empty} ${t.emptyHint}`} /> : null}
      {offline ? <Notice tone="warn">{t.offlineNote}</Notice> : null}
      {cache ? (
        <Text style={styles.detail}>
          {t.lastUpdate}: {clock(cache.at)}
        </Text>
      ) : null}
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
  card: { gap: 4 },
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
