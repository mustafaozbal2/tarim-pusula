import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  colors,
  Durum,
  fontFamily,
  fontSize,
  Rozet,
  Tablo,
  type TabloSatiri,
  type TabloSutunu,
} from '@tarim/ui';
import { BilgiKarti } from '../components/BilgiKarti';
import { Screen } from '../components/Screen';
import { tr } from '../i18n/tr';

const t = tr.lists;

/** Salt okunur bilgi listesi: arama + tablo + onay rozeti + kaynak notu. */
export function RefList(props: {
  title: string;
  note: string;
  searchLabel: string;
  columns: TabloSutunu[];
  load: () => Promise<TabloSatiri[]>;
  testID: string;
  howTitle: string;
  howLines: string[];
}) {
  const [rows, setRows] = useState<TabloSatiri[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const loadRef = useRef(props.load);
  loadRef.current = props.load;
  const run = useCallback(() => {
    setFailed(false);
    loadRef
      .current()
      .then(setRows)
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(run);

  const drafts = rows?.filter((r) => r['durum'] === 'Taslak').length ?? 0;
  return (
    <Screen title={props.title}>
      <Text style={styles.note}>{props.note}</Text>
      {drafts > 0 ? <Rozet /> : null}
      {failed ? (
        <Durum kind="hata" text={t.failed} action={{ label: t.retry, onPress: run }} />
      ) : rows === null ? (
        <Durum kind="yukleniyor" text={t.loading} />
      ) : (
        <Tablo
          testID={props.testID}
          columns={props.columns}
          rows={rows}
          query={query}
          onQuery={setQuery}
          searchLabel={props.searchLabel}
          empty={t.empty}
        />
      )}
      <BilgiKarti title={props.howTitle} lines={props.howLines} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
