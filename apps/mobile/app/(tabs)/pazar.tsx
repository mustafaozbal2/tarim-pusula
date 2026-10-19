import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Chip, colors, fontFamily } from '@tarim/ui';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';

const t = tr.market;

export default function MarketScreen() {
  const [crop, setCrop] = useState<string>(t.crops[0]);
  return (
    <Screen title={t.title}>
      <View style={styles.chips}>
        {t.crops.map((c) => (
          <Chip key={c} label={c} selected={c === crop} onPress={() => setCrop(c)} />
        ))}
      </View>
      <Card>
        <Text style={styles.small}>{t.priceLabel}</Text>
        <Text style={styles.price}>
          {t.price} <Text style={styles.small}>{t.unit}</Text>
        </Text>
        <Text style={styles.trend}>{t.trend}</Text>
        <Text style={styles.small}>{t.sampleNote}</Text>
      </Card>
      <Text style={styles.section}>{t.whereTitle}</Text>
      {t.places.map((p) => (
        <Card key={p.name} style={styles.place}>
          <View style={{ flex: 1 }}>
            <Text style={styles.placeName}>{p.name}</Text>
            <Text style={styles.small}>{p.distance}</Text>
          </View>
          <Text style={styles.placePrice}>{p.price}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.textMuted },
  price: { fontFamily: fontFamily.extrabold, fontSize: 44, color: colors.forest },
  trend: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.pistachioText },
  section: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest, marginTop: 8 },
  place: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
  placeName: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  placePrice: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
});
