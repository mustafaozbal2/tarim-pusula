import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize } from '@tarim/ui';
import type { DeviceDto, FieldDto } from '../../src/api/client';
import { Notice } from '../../src/components/FlowParts';
import { PendingProposals } from '../../src/components/Proposals';
import { Screen } from '../../src/components/Screen';
import { resetDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { kv } from '../../src/offline/kvStore';
import type { QueueItem } from '../../src/offline/queue';
import { api, queue } from '../../src/session';

const t = tr.fields;
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

  return (
    <Screen title={t.title}>
      {bilgi ? <Notice>{bilgi}</Notice> : null}
      <PendingProposals onChanged={() => void load()} />
      {waiting.map((w) => (
        <Card key={w.id} style={styles.card}>
          <Text style={styles.name}>{w.payload.name}</Text>
          <View style={styles.status}>
            <Text style={styles.statusText}>{t.waiting}</Text>
          </View>
        </Card>
      ))}
      {cache?.fields.map((f) => (
        <Card key={f.id} style={styles.card}>
          <Text style={styles.name} testID="tarla-karti">
            {f.name}
          </Text>
          <Text style={styles.detail}>
            {[f.village, f.district, f.province].filter(Boolean).join(' · ')}
            {f.areaDecare
              ? ` · ${f.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${t.area}`
              : ''}
          </Text>
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
      {empty ? (
        <>
          <Text style={styles.name}>{t.empty}</Text>
          <Text style={styles.detail}>{t.emptyHint}</Text>
        </>
      ) : null}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  detail: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  status: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.amberSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.amberText },
});
