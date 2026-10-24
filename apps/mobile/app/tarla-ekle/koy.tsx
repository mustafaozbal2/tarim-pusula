import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { BigChoice, Button, colors, fontFamily, fontSize, radius } from '@tarim/ui';
import {
  FlowHeader,
  FlowScreen,
  Notice,
  subtitleStyle,
  titleStyle,
} from '../../src/components/FlowParts';
import { centroid, withPoint } from '../../src/flow/draft';
import { updateDraft, useDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import type { PlaceDto } from '../../src/api/client';
import { api } from '../../src/session';

const t = tr.flow;
/** Prototipteki dört pilot il; diğer iller yazarak aranır. */
const QUICK_PROVINCES = ['Gaziantep', 'Şanlıurfa', 'Adıyaman', 'Kilis'];

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

const inputStyle = {
  minHeight: 44,
  borderRadius: radius.row,
  borderWidth: 1,
  borderColor: colors.forest,
  backgroundColor: colors.surface,
  paddingHorizontal: 16,
  fontFamily: fontFamily.semibold,
  fontSize: fontSize.body,
  color: colors.forest,
} as const;

/** Köyümü seçeyim: il > ilçe > köy. Listede yoksa adı yazılır. */
export default function VillageScreen() {
  const router = useRouter();
  const draft = useDraft();
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [villages, setVillages] = useState<PlaceDto[]>([]);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    api.provinces().then(setProvinces, () => setError(true));
  }, []);
  useEffect(() => {
    if (province) api.districts(province).then(setDistricts, () => setError(true));
  }, [province]);
  useEffect(() => {
    if (province && district)
      api.villages(province, district).then(setVillages, () => setError(true));
  }, [province, district]);

  const filteredProvinces = useMemo(
    () => (query ? provinces.filter((p) => fold(p).includes(fold(query))) : []),
    [provinces, query],
  );
  const filteredVillages = useMemo(
    () => (query ? villages.filter((v) => fold(v.name).includes(fold(query))) : villages),
    [villages, query],
  );

  function pickVillage(v: { name: string; lat: number; lon: number }) {
    updateDraft((d) =>
      withPoint(d, v, 'koy', { province: province!, district: district!, village: v.name }),
    );
    router.push('/tarla-ekle/harita');
  }

  function pickTyped() {
    const c = centroid(villages);
    if (!c || !typed.trim()) return;
    pickVillage({ name: typed.trim(), ...c });
  }

  const step = !province ? 'il' : !district ? 'ilce' : 'koy';
  const back = () => {
    setQuery('');
    setTyping(false);
    if (step === 'koy') setDistrict(null);
    else if (step === 'ilce') setProvince(null);
    else if (router.canGoBack()) router.back();
    else router.replace('/tarla-ekle');
  };

  return (
    <FlowScreen>
      <FlowHeader step={t.step1} onBack={back} />
      <Text accessibilityRole="header" style={titleStyle}>
        {t.villageTitle}
      </Text>
      {draft.notice === 'gps-reddedildi' ? <Notice tone="warn">{t.gpsDenied}</Notice> : null}
      {error ? <Notice tone="warn">{tr.login.noNet}</Notice> : null}

      {step === 'il' ? (
        <>
          <Text style={subtitleStyle}>{t.whichProvince}</Text>
          {QUICK_PROVINCES.map((p) => (
            <BigChoice key={p} title={p} onPress={() => (setQuery(''), setProvince(p))} />
          ))}
          <Text style={subtitleStyle}>{t.otherProvince}</Text>
          <TextInput
            accessibilityLabel={t.otherProvince}
            testID="il-ara"
            value={query}
            onChangeText={setQuery}
            placeholder={t.searchPlaceholder}
            style={inputStyle}
          />
          {filteredProvinces.slice(0, 8).map((p) => (
            <BigChoice key={p} title={p} onPress={() => (setQuery(''), setProvince(p))} />
          ))}
        </>
      ) : null}

      {step === 'ilce' ? (
        <>
          <Text style={subtitleStyle}>{province}</Text>
          <Text style={[titleStyle, { fontSize: 18 }]}>{t.whichDistrict}</Text>
          {districts.map((d) => (
            <BigChoice key={d} title={d} onPress={() => (setQuery(''), setDistrict(d))} />
          ))}
        </>
      ) : null}

      {step === 'koy' ? (
        <>
          <Text style={subtitleStyle}>
            {province} · {district}
          </Text>
          <Text style={[titleStyle, { fontSize: 18 }]}>{t.whichVillage}</Text>
          {typing ? (
            <View style={{ gap: 12 }}>
              <TextInput
                accessibilityLabel={t.typeName}
                testID="koy-yaz"
                value={typed}
                onChangeText={setTyped}
                placeholder={t.typeName}
                style={inputStyle}
              />
              <Button label={t.next} onPress={pickTyped} />
            </View>
          ) : (
            <>
              <TextInput
                accessibilityLabel={t.searchPlaceholder}
                testID="koy-ara"
                value={query}
                onChangeText={setQuery}
                placeholder={t.searchPlaceholder}
                style={inputStyle}
              />
              {filteredVillages.slice(0, 40).map((v) => (
                <BigChoice
                  key={`${v.name}-${v.lat}`}
                  title={v.name}
                  onPress={() => pickVillage(v)}
                />
              ))}
              <Button variant="secondary" label={t.notInList} onPress={() => setTyping(true)} />
            </>
          )}
        </>
      ) : null}
    </FlowScreen>
  );
}
