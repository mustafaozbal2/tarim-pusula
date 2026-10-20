import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { tr } from '../src/i18n/tr';
import { loadNdvi, type NdviResult } from '../src/ndvi/load';
import {
  bars,
  latestPoint,
  skippedText,
  sourceLine,
  trendText,
  type Series,
} from '../src/ndvi/model';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { nextFieldId } from '../src/today/load';
import { clock } from '../src/today/model';

const t = tr.ndvi;
const CHART_HEIGHT = 160;

/** Sade çubuk grafik: yükseklik doğrudan değerdir (0-1); her çubuğun altında sayı yazar. */
function Chart({ s }: { s: Series }) {
  const list = bars(s);
  return (
    <View accessibilityLabel={t.chartLabel} testID="ndvi-grafik">
      <View style={styles.chart}>
        {list.map((b, i) => (
          <View
            key={i}
            testID="ndvi-cubuk"
            style={[styles.bar, { height: Math.max(4, b.height * CHART_HEIGHT) }]}
          />
        ))}
      </View>
      <View style={styles.axis}>
        <Text style={styles.small}>{list[0]?.label}</Text>
        <Text style={styles.small}>{list[list.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

export default function NdviScreen() {
  const { fieldId } = useLocalSearchParams<{ fieldId?: string }>();
  const [res, setRes] = useState<NdviResult | null | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [why, setWhy] = useState(false);

  const load = useCallback(
    async (pick?: string) => {
      try {
        setRes(await loadNdvi(api, kv, pick ?? fieldId));
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [fieldId],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = (
    <>
      <FlowHeader />
      <Text accessibilityRole="header" style={styles.title}>
        {t.title}
      </Text>
    </>
  );
  if (state !== 'ready' || res === undefined) {
    return (
      <FlowScreen>
        {header}
        <Text style={styles.small}>{state === 'error' ? t.error : t.loading}</Text>
      </FlowScreen>
    );
  }
  if (res === null) {
    return (
      <FlowScreen>
        {header}
        <Text style={styles.body}>{t.noField}</Text>
      </FlowScreen>
    );
  }

  const { data, field } = res;
  const s = data.kind === 'series' ? data : null;
  const src = s ? sourceLine(s) : null;
  const trend = s ? trendText(s) : null;
  const latest = s ? latestPoint(s) : null;
  return (
    <FlowScreen
      footer={
        res.fields.length > 1 ? (
          <Button
            label={t.nextField}
            variant="secondary"
            onPress={() => void load(nextFieldId(res.fields, field.id))}
          />
        ) : undefined
      }
    >
      {header}
      <Text style={styles.body} testID="ndvi-tarla">
        {field.name}
      </Text>
      {res.offline ? <Notice tone="warn">{t.offline}</Notice> : null}
      {s?.stale ? <Notice tone="warn">{t.stale}</Notice> : null}

      {data.kind === 'none' ? (
        <Card style={styles.card}>
          <Text style={styles.body} testID="ndvi-yok">
            {data.reason === 'sinir-yok' ? t.noBoundary : t.noData}
          </Text>
          {data.reason === 'sinir-yok' ? (
            <Text style={styles.small}>{t.noBoundaryHint}</Text>
          ) : null}
        </Card>
      ) : null}

      {s && src && trend ? (
        <>
          <Text style={styles.small}>{t.intro}</Text>
          {s.sample ? (
            <Notice tone="warn">
              <Text testID="ndvi-ornek">{t.sampleBadge}</Text>
            </Notice>
          ) : null}
          <Card style={styles.card}>
            <Text style={styles.small}>{t.chartLabel}</Text>
            {latest ? (
              <Text style={styles.big} testID="ndvi-son">
                {latest.value}{' '}
                <Text style={styles.small}>
                  {t.latest}: {latest.date}
                </Text>
              </Text>
            ) : null}
            <Chart s={s} />
            <Text style={styles.small}>{t.scale}</Text>
            {skippedText(s) ? <Text style={styles.small}>{skippedText(s)}</Text> : null}
          </Card>

          <Card style={styles.card}>
            {trend.title ? (
              <Text style={styles.warnTitle} testID="ndvi-dusus">
                {trend.title}
              </Text>
            ) : null}
            <Text style={styles.body}>{trend.body}</Text>
            {/* Düşüş kuralı uzman onaylı değil: rozetli, uyarı/komut üretmez. */}
            <Badge label={t.pendingBadge} />
          </Card>

          <Button label={t.why} variant="secondary" onPress={() => setWhy((v) => !v)} />
          {why ? <Text style={styles.small}>{t.whyBody}</Text> : null}
          <Text style={styles.small} testID="ndvi-kaynak">
            {t.source}: {src}
          </Text>
          <Text style={styles.small}>
            {t.lastUpdate}: {clock(res.at)}
          </Text>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, color: colors.forest },
  body: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  big: { fontFamily: fontFamily.extrabold, fontSize: 36, color: colors.forest },
  warnTitle: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.amberText },
  card: { gap: spacing.sm },
  chart: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bar: { flex: 1, backgroundColor: colors.forest, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
