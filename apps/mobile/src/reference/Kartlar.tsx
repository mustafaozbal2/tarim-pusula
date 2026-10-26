import { useCallback, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, elevation, fontFamily, fontSize, homeColors, radius } from '@tarim/ui';
import type { ImageName } from '../assets';
import { BilgiKarti } from '../components/BilgiKarti';
import { SayfaGorseli } from '../components/Gorsel';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Iskelet, YuklemeHatasi } from '../components/Yukleme';
import { tr } from '../i18n/tr';
import { withDeadline } from '../load/deadline';

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

/**
 * Bilgi listesi (G23.16): tablo yerine çocuğun anlayacağı kartlar. Arama, iskelet, hata durumu ortak;
 * her kartın içeriği sayfa tarafından çizilir.
 */
export function KartListesi<T extends { id: string; ad: string }>(props: {
  title: string;
  hero: string;
  image: ImageName;
  searchLabel: string;
  load: () => Promise<T[]>;
  render: (row: T) => ReactNode;
  testID: string;
  howTitle: string;
  howLines: string[];
}) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const loadRef = useRef(props.load);
  loadRef.current = props.load;
  const run = useCallback(() => {
    setFailed(false);
    withDeadline(loadRef.current())
      .then(setRows)
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(run);
  const shown = (rows ?? []).filter((r) => !query || fold(r.ad).includes(fold(query)));
  return (
    <Screen title={props.title}>
      <SayfaGorseli image={props.image} text={props.hero} />
      <View style={styles.search}>
        <Icon name="target" size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel={props.searchLabel}
          placeholder={props.searchLabel}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          style={styles.input}
        />
      </View>
      {failed ? <YuklemeHatasi onRetry={run} /> : null}
      {!failed && rows === null ? <Iskelet rows={3} /> : null}
      <View style={styles.list} testID={props.testID}>
        {shown.map((r) => (
          <View key={r.id} style={styles.card}>
            {props.render(r)}
          </View>
        ))}
        {rows && shown.length === 0 ? <Text style={styles.empty}>{tr.lists.empty}</Text> : null}
      </View>
      <BilgiKarti title={props.howTitle} lines={props.howLines} />
    </Screen>
  );
}

/** 0..1 arası doluluk çubuğu, etiket ve değer yazısıyla. */
export function Cubuk({
  label,
  value,
  ratio,
  color = homeColors.band,
}: {
  label: string;
  value: string;
  ratio: number;
  color?: string;
}) {
  const w = `${Math.max(4, Math.min(100, ratio * 100))}%` as const;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.bar, { width: w, backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

export const kartStil = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  hint: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  tag: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.amberText,
    backgroundColor: colors.amberSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  tagOk: { color: colors.forest, backgroundColor: colors.pistachio },
});

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 46,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.body,
    color: colors.forest,
  },
  list: { gap: 10 },
  card: {
    gap: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  empty: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 104, fontFamily: fontFamily.semibold, fontSize: 13, color: colors.forest },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.card },
  bar: { height: 12, borderRadius: 6 },
  barValue: { width: 44, fontFamily: fontFamily.bold, fontSize: 13, color: colors.forest },
});
