import { useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Card, colors, Durum, fontFamily, fontSize, Rozet, spacing } from '@tarim/ui';
import { HavaSimgesi } from '../src/components/KonumHavaBasligi';
import { BilgiKarti } from '../src/components/BilgiKarti';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { useToday } from '../src/hooks/useToday';
import { placeLine } from '../src/home/model';
import { tr } from '../src/i18n/tr';
import { localIso } from '../src/home/model';
import { clock, frostCardModel, weatherText } from '../src/today/model';
import { currentRows, forecastRows } from '../src/today/weatherView';

const t = tr.weather;

/**
 * Hava Durumu: seçili arazinin KOORDİNATI için tahmin. Kaynak ve saat her zaman görünür;
 * demo derlemesinde "Örnek veri" etiketi vardır. Don durumu burada; onaysız eşikte satır hiç çıkmaz.
 */
export default function WeatherScreen() {
  const router = useRouter();
  const { data, state, reload } = useToday();
  if (state !== 'ready' || !data) {
    return (
      <Screen title={t.title}>
        {state === 'loading' ? <Iskelet /> : null}
        {state === 'error' ? (
          <>
            <YuklemeHatasi onRetry={() => void reload()} />
            <SunucuKarti onRetry={() => void reload()} />
          </>
        ) : null}
        {state === 'empty' ? (
          <Durum
            kind="bos"
            text={`${tr.today.noField} ${tr.today.noFieldHint}`}
            action={{ label: tr.today.addField, onPress: () => router.push('/tarla-ekle') }}
          />
        ) : null}
      </Screen>
    );
  }
  const { field, today } = data;
  const w = today.weather;
  const frost = frostCardModel(today.frost);
  const showFrost = frost.kind === 'warning' || frost.kind === 'watch' || frost.kind === 'quiet';
  const warn = frost.kind === 'warning' || frost.kind === 'watch';
  const temp = w.current?.tempC;
  const now = currentRows(w.current);
  const days = forecastRows(w.days ?? [w.today], localIso());
  return (
    <Screen title={t.title}>
      <Card style={styles.card} testID="hava-ozet">
        <Text style={styles.place}>
          {field.name}
          {placeLine(field) ? ` · ${placeLine(field)}` : ''}
        </Text>
        <Text style={styles.small}>
          {t.coordinate}: {field.lat?.toFixed(3)}, {field.lon?.toFixed(3)}
        </Text>
        <View style={styles.tempRow}>
          <Text style={styles.temp} testID="hava-sicaklik">
            {temp === undefined ? '--' : `${Math.round(temp)}°`}
          </Text>
          <HavaSimgesi size={36} />
          <Text style={[styles.body, styles.flex]}>{weatherText(w.current?.weatherCode)}</Text>
        </View>
        <Text style={styles.label}>{t.now}</Text>
        <View style={styles.grid} testID="hava-simdi">
          {now.map((r) => (
            <View key={r.label} style={styles.cell}>
              <Text style={styles.cellValue}>{r.value}</Text>
              <Text style={styles.small}>{r.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.card} testID="hava-tahmin">
        <Text style={styles.label}>{t.forecast}</Text>
        <View style={styles.fRow}>
          <Text style={[styles.small, styles.fDay]}>{t.day}</Text>
          <Text style={[styles.small, styles.fMid]}>{t.minMax}</Text>
          <Text style={[styles.small, styles.fRain]}>{t.rainShort}</Text>
        </View>
        {days.map((d) => (
          <View key={d.key} style={styles.fRow} testID="hava-gun">
            <Text style={[styles.body, styles.fDay]}>{d.day}</Text>
            <Text style={[styles.body, styles.fMid]}>{d.minMax}</Text>
            <Text style={[styles.body, styles.fRain]}>{d.rain}</Text>
          </View>
        ))}
        <Text style={styles.small}>
          {t.et0}: {today.et0.mmPerDay.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm/gün
        </Text>
      </Card>

      {showFrost ? (
        <Card style={[styles.card, warn && styles.warn]} testID="hava-don">
          <Text style={styles.label}>{t.frost}</Text>
          <Text style={styles.body} testID="hava-don-baslik">
            {frost.title}
          </Text>
          <Text style={styles.small}>{frost.body}</Text>
          {'why' in frost && warn ? <Text style={styles.small}>{frost.why}</Text> : null}
        </Card>
      ) : null}

      {w.sample ? (
        <View style={styles.sample} testID="hava-ornek">
          <Rozet label={tr.common.sampleData} />
        </View>
      ) : null}
      <Text style={styles.small} testID="hava-kaynak">
        {tr.common.source}: {w.source}
        {w.version ? ` · ${t.version}: ${w.version}` : ''}
      </Text>
      <Text style={styles.small} testID="hava-guncelleme">
        {tr.today.lastUpdate}: {clock(w.fetchedAt)}
      </Text>
      <Text
        style={[styles.small, styles.link]}
        accessibilityRole="link"
        onPress={() => void Linking.openURL('https://open-meteo.com/')}
      >
        {t.attribution}
      </Text>
      {data.offline ? <Text style={styles.small}>{tr.today.offline}</Text> : null}
      {w.stale && !data.offline ? <Text style={styles.small}>{tr.today.stale}</Text> : null}
      <BilgiKarti title={t.howTitle} lines={[...t.how]} testID="hava-nasil" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  warn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  place: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  tempRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  temp: { fontFamily: fontFamily.extrabold, fontSize: fontSize.display, color: colors.forest },
  label: { fontFamily: fontFamily.extrabold, fontSize: fontSize.caption, color: colors.amberText },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cellValue: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  fRow: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  fDay: { flex: 1.2 },
  fMid: { flex: 1.4, textAlign: 'center' },
  fRain: { flex: 1, textAlign: 'right' },
  sample: { flexDirection: 'row' },
  link: { textDecorationLine: 'underline' },
});
