import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Chip, Button, colors, fontFamily, spacing } from '@tarim/ui';
import type { MarketPlaceDto } from '../../src/api/client';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';
import { loadMarket, type MarketResult } from '../../src/market/load';
import {
  dayText,
  distanceText,
  hasSource,
  netText,
  sourceLine,
  tl,
  trendText,
} from '../../src/market/model';
import { kv } from '../../src/offline/kvStore';
import { api } from '../../src/session';
import { clock } from '../../src/today/model';

const t = tr.market;

export default function MarketScreen() {
  const [res, setRes] = useState<MarketResult | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [why, setWhy] = useState<string | null>(null);

  const load = useCallback(async (pick?: string) => {
    try {
      setRes(await loadMarket(api, kv, pick));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (state !== 'ready' || !res) {
    return (
      <Screen title={t.title}>
        <Text style={styles.small}>{state === 'error' ? t.error : t.loading}</Text>
      </Screen>
    );
  }

  const cur = res.data?.current && hasSource(res.data.current) ? res.data.current : null;
  const places = (res.data?.places ?? []).filter(hasSource);
  const national = (res.data?.national ?? []).filter(hasSource);

  return (
    <Screen title={t.title}>
      <View style={styles.chips}>
        {res.crops.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={c.id === res.cropId}
            onPress={() => void load(c.id)}
          />
        ))}
      </View>

      {cur ? (
        <Card>
          <Text style={styles.small}>{t.priceLabel}</Text>
          <Text style={styles.price} testID="pazar-fiyat">
            {tl(cur.price)} <Text style={styles.small}>{t.unit}</Text>
          </Text>
          <Text style={styles.small}>
            {t.range}: {tl(cur.priceMin)} - {tl(cur.priceMax)}
          </Text>
          <Text style={styles.trend} testID="pazar-trend">
            {trendText(cur.trend)}
          </Text>
          {cur.stale ? <Text style={styles.stale}>{t.stale}</Text> : null}
          <Text style={styles.small} testID="pazar-kaynak">
            {sourceLine(cur)}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={styles.placeName} testID="pazar-yok">
            {t.noPrice}
          </Text>
          <Text style={styles.small}>{t.noPriceHint}</Text>
        </Card>
      )}

      {places.length > 0 ? <Text style={styles.section}>{t.whereTitle}</Text> : null}
      {places.map((p) => (
        <PlaceCard
          key={p.placeId}
          p={p}
          open={why === p.placeId}
          onWhy={() => setWhy(why === p.placeId ? null : p.placeId)}
        />
      ))}

      {national.length > 0 ? <Text style={styles.section}>{t.nationalTitle}</Text> : null}
      {national.map((p) => (
        <Card key={p.placeId}>
          <Text style={styles.placeName}>{p.name}</Text>
          <Text style={styles.placePrice}>
            {tl(p.price)} <Text style={styles.small}>{t.unit}</Text>
          </Text>
          {p.stale ? <Text style={styles.stale}>{t.stale}</Text> : null}
          <Text style={styles.small}>{sourceLine(p)}</Text>
        </Card>
      ))}

      {res.offline ? <Text style={styles.small}>{t.offline}</Text> : null}
      {res.at ? (
        <Text style={styles.small} testID="pazar-guncelleme">
          {t.lastUpdate}: {clock(res.at)}
        </Text>
      ) : null}
    </Screen>
  );
}

function PlaceCard({ p, open, onWhy }: { p: MarketPlaceDto; open: boolean; onWhy: () => void }) {
  const net = netText(p.net);
  const dist = distanceText(p);
  return (
    <Card style={styles.place}>
      <View style={styles.placeTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.placeName} testID={`pazar-yer-${p.placeId}`}>
            {p.name}
          </Text>
          {dist ? <Text style={styles.small}>{dist}</Text> : null}
        </View>
        <Text style={styles.placePrice}>{tl(p.price)}</Text>
      </View>
      <Text style={styles.small}>{trendText(p.trend)}</Text>
      <Text style={styles.small}>{t.netTitle}</Text>
      <Text style={styles.net} testID={`pazar-net-${p.placeId}`}>
        {net ?? t.netNone}
      </Text>
      {p.stale ? <Text style={styles.stale}>{t.stale}</Text> : null}
      <Text style={styles.small}>
        {sourceLine(p)} ({dayText(p.date)})
      </Text>
      <Button label={t.netWhy} variant="secondary" onPress={onWhy} />
      {open ? (
        <Text style={styles.small}>
          {t.netWhyBody} {p.net.assumptions.join('. ')}.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.textMuted },
  price: { fontFamily: fontFamily.extrabold, fontSize: 44, color: colors.forest },
  trend: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.pistachioText },
  stale: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.amberText },
  section: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest, marginTop: 8 },
  place: { gap: spacing.sm },
  placeTop: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
  placeName: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  placePrice: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  net: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.water },
});
