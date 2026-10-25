import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card, colors, Durum, fontFamily, fontSize, spacing } from '@tarim/ui';
import { DEMO_BUILD } from '../src/demo';
import { HavaSimgesi } from '../src/components/KonumHavaBasligi';
import { BilgiKarti } from '../src/components/BilgiKarti';
import { Screen } from '../src/components/Screen';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { useToday } from '../src/hooks/useToday';
import { placeLine } from '../src/home/model';
import { tr } from '../src/i18n/tr';
import { clock, frostCardModel, weatherText } from '../src/today/model';

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
        {state === 'loading' ? <Durum kind="yukleniyor" text={tr.today.loading} /> : null}
        {state === 'error' ? <SunucuKarti onRetry={() => void reload()} /> : null}
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
        </View>
        <Text style={styles.body}>{weatherText(w.current?.weatherCode)}</Text>
        <Text style={styles.body}>
          {tr.today.minMax
            .replace('{{min}}', String(Math.round(w.today.tMinC)))
            .replace('{{max}}', String(Math.round(w.today.tMaxC)))}
        </Text>
        {w.today.precipMm !== null ? (
          <Text style={styles.body}>
            {t.rain}: {w.today.precipMm.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm
          </Text>
        ) : null}
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

      <Text style={styles.small} testID="hava-kaynak">
        {tr.common.source}: {w.source}, {clock(w.fetchedAt)}
        {DEMO_BUILD ? ` · ${tr.common.sampleData}` : ''}
      </Text>
      {data.offline ? <Text style={styles.small}>{tr.today.offline}</Text> : null}
      {w.stale && !data.offline ? <Text style={styles.small}>{tr.today.stale}</Text> : null}
      <Text style={styles.small}>
        {tr.today.lastUpdate}: {clock(data.at)}
      </Text>
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
});
