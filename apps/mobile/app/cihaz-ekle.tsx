import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BigChoice, Button, Card, colors, Durum, FormAlani, fontFamily, fontSize } from '@tarim/ui';
import type { ConnectionMethod, DeviceKind } from '@tarim/schemas';
import type { FieldDto } from '../src/api/client';
import { Screen } from '../src/components/Screen';
import {
  buildRegisterBody,
  CONNECTION_METHOD_LABELS,
  DEVICE_KIND_LABELS,
  DEVICE_KINDS,
  KIND_METHODS,
} from '../src/devices/model';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { ApiError } from '../src/api/client';
import { api } from '../src/session';
import { FIELDS_CACHE, SELECTED } from '../src/today/load';

const t = tr.deviceAdd;

/**
 * Cihaz ekle (arazi başına): tür > bağlantı yöntemi > künye (ad, üretici, model, kod). Yöntem bir
 * adaptördür; gerçek üretici API'leri sözleşme gerektirdiğinden üretici bulutu şimdilik örnek veriyle
 * çalışır ve bu açıkça yazılır. Sahiplik sunucuda doğrulanır.
 */
export default function AddDeviceScreen() {
  const router = useRouter();
  const { fieldId: fieldParam } = useLocalSearchParams<{ fieldId?: string }>();
  const [field, setField] = useState<FieldDto | null | undefined>(undefined);
  const [kind, setKind] = useState<DeviceKind | null>(null);
  const [method, setMethod] = useState<ConnectionMethod | null>(null);
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const raw = await kv.get(FIELDS_CACHE);
        const fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
        const chosen = fieldParam ?? (await kv.get(SELECTED));
        setField(fields.find((f) => f.id === chosen) ?? fields[0] ?? null);
      })();
    }, [fieldParam]),
  );

  const methods = kind ? KIND_METHODS[kind] : [];
  const needsCode = method === 'eslestirme-kodu';

  const submit = async () => {
    const r = buildRegisterBody({
      fieldId: field?.id,
      name,
      kind,
      method,
      manufacturer,
      model,
      pairingCode: code,
    });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.message });
    setBusy(true);
    try {
      const res = await api.registerDevice(r.body);
      setMsg({ tone: 'ok', text: res.message });
      setTimeout(() => router.replace('/cihazlar'), 900);
    } catch (e) {
      setMsg({
        tone: 'bad',
        text:
          e instanceof ApiError && e.status === 403
            ? t.forbidden
            : e instanceof ApiError
              ? e.message
              : t.offline,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t.title}>
      {field === undefined ? <Durum kind="yukleniyor" text={tr.today.loading} /> : null}
      {field === null ? (
        <Durum
          kind="bos"
          text={t.noField}
          action={{ label: tr.today.addField, onPress: () => router.push('/tarla-ekle') }}
        />
      ) : null}
      {field ? (
        <>
          <Text style={styles.field} testID="cihaz-ekle-arazi">
            {field.name}
          </Text>
          <Text style={styles.label}>{t.kindTitle}</Text>
          {DEVICE_KINDS.map((k) => (
            <BigChoice
              key={k}
              title={DEVICE_KIND_LABELS[k]}
              selected={kind === k}
              onPress={() => {
                setKind(k);
                setMethod(null);
                setMsg(null);
              }}
            />
          ))}
          {kind ? (
            <>
              <Text style={styles.label}>{t.methodTitle}</Text>
              {methods.map((m) => (
                <BigChoice
                  key={m}
                  title={CONNECTION_METHOD_LABELS[m]}
                  hint={m === 'uretici-bulutu' ? t.cloudHint : undefined}
                  selected={method === m}
                  onPress={() => setMethod(m)}
                />
              ))}
            </>
          ) : null}
          {method ? (
            <Card style={styles.form}>
              <FormAlani label={t.name} value={name} onChangeText={setName} testID="cihaz-ad" />
              <FormAlani
                label={t.manufacturer}
                value={manufacturer}
                onChangeText={setManufacturer}
                testID="cihaz-uretici"
              />
              <FormAlani
                label={t.model}
                value={model}
                onChangeText={setModel}
                testID="cihaz-model"
              />
              {needsCode || method === 'uretici-bulutu' ? (
                <FormAlani
                  label={needsCode ? t.pairingCode : t.accountCode}
                  value={code}
                  onChangeText={setCode}
                  testID="cihaz-kod"
                />
              ) : null}
              <Text style={styles.hint}>{t.provenance}</Text>
            </Card>
          ) : null}
          {msg ? (
            <Text
              style={[styles.msg, msg.tone === 'bad' && { color: colors.brick }]}
              testID="cihaz-ekle-mesaj"
            >
              {msg.text}
            </Text>
          ) : null}
          <Button
            label={busy ? t.saving : t.save}
            testID="cihaz-kaydet"
            onPress={() => void submit()}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  label: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.row,
    color: colors.forest,
    marginTop: 4,
  },
  form: { gap: 8 },
  hint: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  msg: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest },
});
