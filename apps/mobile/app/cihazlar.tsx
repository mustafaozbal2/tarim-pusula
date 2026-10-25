import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, colors, Durum, fontFamily, fontSize } from '@tarim/ui';
import type { DeviceDto, FieldDto } from '../src/api/client';
import { Screen } from '../src/components/Screen';
import { deviceLines } from '../src/devices/model';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { FIELDS_CACHE, SELECTED } from '../src/today/load';

const t = tr.devices;

/** Seçili arazinin cihazları: künye (tür, üretici, model, kaynak, sürüm, eklenme tarihi) ve çıkarma. */
export default function DevicesScreen() {
  const router = useRouter();
  const [field, setField] = useState<FieldDto | null>(null);
  const [devices, setDevices] = useState<DeviceDto[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const raw = await kv.get(FIELDS_CACHE);
    const fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
    const chosen = await kv.get(SELECTED);
    const f = fields.find((x) => x.id === chosen) ?? fields[0] ?? null;
    setField(f);
    try {
      const all = await api.devices();
      setDevices(all.filter((d) => d.fieldId === f?.id));
    } catch {
      setDevices([]);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = async (id: string) => {
    setConfirm(null);
    try {
      await api.deleteDevice(id);
    } finally {
      void load();
    }
  };

  return (
    <Screen title={t.title}>
      {field ? (
        <Text style={styles.field} testID="cihazlar-arazi">
          {field.name}
        </Text>
      ) : null}
      {devices === null ? <Durum kind="yukleniyor" text={tr.today.loading} /> : null}
      {devices?.length === 0 ? <Durum kind="bos" text={t.empty} /> : null}
      {devices?.map((d) => (
        <Card key={d.id} style={styles.card} testID="cihaz-karti">
          <Text style={styles.name}>{d.name}</Text>
          {deviceLines(d).map((l) => (
            <Text key={l} style={styles.small}>
              {l}
            </Text>
          ))}
          {confirm === d.id ? (
            <>
              <Text style={styles.small}>{t.confirm}</Text>
              <Button label={t.removeYes} variant="danger" onPress={() => void remove(d.id)} />
              <Button
                label={tr.irrigation.cancel}
                variant="secondary"
                onPress={() => setConfirm(null)}
              />
            </>
          ) : (
            <Button
              label={t.remove}
              variant="secondary"
              testID="cihaz-cikar"
              onPress={() => setConfirm(d.id)}
            />
          )}
        </Card>
      ))}
      <Button
        label={t.add}
        testID="cihaz-ekle-dugme"
        onPress={() => router.push({ pathname: '/cihaz-ekle', params: { fieldId: field?.id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  card: { gap: 2 },
  name: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
