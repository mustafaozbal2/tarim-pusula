import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, colors, fontFamily, spacing } from '@tarim/ui';
import type { MarketPlaceDto } from '../../src/api/client';
import { Icon } from '../../src/components/Icon';
import { ImageSlot } from '../../src/components/ImageSlot';
import { SayfaGorseli } from '../../src/components/Gorsel';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';
import { chooseMarketPlace, loadMarket, type MarketResult } from '../../src/market/load';
import {
  changeArrow,
  dayText,
  directionsUrl,
  distanceText,
  hasSource,
  netText,
  pickCurrent,
  productImageName,
  sourceLine,
  tl,
  trendText,
} from '../../src/market/model';
import { kv } from '../../src/offline/kvStore';
import { api } from '../../src/session';
import { clock } from '../../src/today/model';

const t = tr.market;

function ChangeArrow({ p }: { p: MarketPlaceDto }) {
  const a = changeArrow(p.trend);
  const icon = a.dir === 'up' ? 'arrowUp' : a.dir === 'down' ? 'arrowDown' : 'arrowFlat';
  const color = a.dir === 'up' ? colors.forest : a.dir === 'down' ? colors.brick : colors.textMuted;
  return (
    <View style={styles.arrow} testID="pazar-ok" accessibilityLabel={a.text}>
      <Icon name={icon} size={18} color={color} />
      <Text style={[styles.arrowText, { color }]}>{a.text}</Text>
    </View>
  );
}

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

  const places = (res.data?.places ?? []).filter(hasSource);
  const national = (res.data?.national ?? []).filter(hasSource);
  const pick = res.data
    ? pickCurrent(res.data, res.fieldProvince, res.chosenPlaceId)
    : { place: null, basis: 'yok' as const };
  const cur = pick.place;
  const cropIndex = Math.max(
    0,
    res.crops.findIndex((c) => c.id === res.cropId),
  );
  const basisText =
    pick.basis === 'secilen-yer'
      ? t.basisChosen
      : pick.basis === 'arazi-ili'
        ? t.basisProvince.replace('{{il}}', res.fieldProvince ?? '')
        : pick.basis === 'en-yeni-kayit'
          ? t.basisLatest
          : '';
  const choose = async (id: string | null) => {
    await chooseMarketPlace(kv, id);
    setRes({ ...res, chosenPlaceId: id });
  };

  return (
    <Screen title={t.title}>
      <SayfaGorseli image="kart_6.jpg" text={t.hero} />
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

      <Text style={styles.section}>{t.sellPlaceTitle}</Text>
      <View style={styles.chips} testID="pazar-satis-yeri">
        <Chip
          label={res.fieldProvince ? t.myProvince.replace('{{il}}', res.fieldProvince) : t.myField}
          selected={res.chosenPlaceId === null}
          onPress={() => void choose(null)}
        />
        {[...places, ...national].map((p) => (
          <Chip
            key={p.placeId}
            label={p.name}
            selected={res.chosenPlaceId === p.placeId}
            onPress={() => void choose(p.placeId)}
          />
        ))}
      </View>

      {cur ? (
        <Card>
          <View style={styles.head}>
            <ImageSlot
              name={productImageName(cropIndex)}
              label={res.data?.cropName ?? ''}
              style={styles.product}
              testID="pazar-urun-gorsel"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeName}>{res.data?.cropName}</Text>
              <Text style={styles.small} testID="pazar-konum">
                {cur.name}
              </Text>
              <Text style={styles.small} testID="pazar-konum-neden">
                {basisText}
              </Text>
            </View>
          </View>
          <Text style={styles.small}>{t.priceLabel}</Text>
          <Text style={styles.price} testID="pazar-fiyat">
            {tl(cur.price)} <Text style={styles.small}>{t.unit}</Text>
          </Text>
          <ChangeArrow p={cur} />
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
  const canRoute = typeof p.lat === 'number' && typeof p.lon === 'number';
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
      <ChangeArrow p={p} />
      <Text style={styles.small}>{trendText(p.trend)}</Text>
      <Text style={styles.small}>{t.netTitle}</Text>
      <Text style={styles.net} testID={`pazar-net-${p.placeId}`}>
        {net ?? t.netNone}
      </Text>
      {p.stale ? <Text style={styles.stale}>{t.stale}</Text> : null}
      <Text style={styles.small}>
        {sourceLine(p)} ({dayText(p.date)})
      </Text>
      {canRoute ? (
        <Button
          label={t.directions}
          testID={`pazar-yol-${p.placeId}`}
          onPress={() => void Linking.openURL(directionsUrl(Platform.OS, p.lat!, p.lon!, p.name))}
        />
      ) : (
        <Text style={styles.small}>{t.noCoords}</Text>
      )}
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
  head: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  product: { width: 64, height: 64, borderRadius: 10 },
  small: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted },
  price: { fontFamily: fontFamily.extrabold, fontSize: 26, color: colors.forest },
  trend: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.pistachioText },
  stale: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.amberText },
  section: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.forest, marginTop: 8 },
  place: { gap: spacing.sm },
  placeTop: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  placeName: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.forest },
  placePrice: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  net: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.water },
  arrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrowText: { fontFamily: fontFamily.extrabold, fontSize: 13 },
});
