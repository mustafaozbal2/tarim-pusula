import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  colors,
  Durum,
  elevation,
  fontFamily,
  fontSize,
  homeColors,
  radius,
  Rozet,
} from '@tarim/ui';
import { IMAGE_FILES } from '../src/assets';
import { Bolum } from '../src/components/Gorsel';
import { Icon, type IconName } from '../src/components/Icon';
import { BilgiKarti } from '../src/components/BilgiKarti';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { useToday } from '../src/hooks/useToday';
import { placeLine } from '../src/home/model';
import { tr } from '../src/i18n/tr';
import { localIso } from '../src/home/model';
import { frostCardModel, weatherText } from '../src/today/model';
import { currentRows, forecastRows } from '../src/today/weatherView';

const t = tr.weather;

/**
 * Hava Durumu: seçili arazinin KOORDİNATI için tahmin. G23: kaynak, saat ve atıf çiftçi ekranında değil,
 * Ayarlar > Hakkında > Kaynaklar'da (veriyle birlikte saklanır, kural 6). Gerçek sağlayıcıya ulaşılamazsa
 * "Örnek veri" rozeti görünür. Don durumu burada; onaysız eşikte satır hiç çıkmaz.
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
  const metricIcon: Record<string, IconName> = {
    Sıcaklık: 'sun',
    Hissedilen: 'people',
    Nem: 'drop',
    Rüzgâr: 'route',
    Yağış: 'drop',
  };
  return (
    <Screen title={t.title}>
      <View style={styles.hero} testID="hava-ozet">
        <Text style={styles.heroPlace} numberOfLines={1}>
          {field.name}
        </Text>
        {placeLine(field) ? <Text style={styles.heroSub}>{placeLine(field)}</Text> : null}
        <View style={styles.heroRow}>
          <Image source={IMAGE_FILES['ikon_hava.png'] as number} style={styles.heroIcon} />
          <View style={styles.heroTempBox}>
            <Text style={styles.heroTemp} testID="hava-sicaklik">
              {temp === undefined ? '--' : `${Math.round(temp)}°`}
            </Text>
            <Text style={styles.heroText}>{weatherText(w.current?.weatherCode)}</Text>
          </View>
        </View>
        <Text style={styles.heroSub}>
          {tr.today.minMax
            .replace('{{min}}', String(Math.round(w.today.tMinC)))
            .replace('{{max}}', String(Math.round(w.today.tMaxC)))}
        </Text>
      </View>

      <Bolum title={t.now}>
        <View style={styles.grid} testID="hava-simdi">
          {now.slice(1).map((r) => (
            <View key={r.label} style={styles.cell}>
              <Icon name={metricIcon[r.label] ?? 'sun'} size={22} color={homeColors.tabSelected} />
              <Text style={styles.cellValue}>{r.value}</Text>
              <Text style={styles.cellLabel}>{r.label}</Text>
            </View>
          ))}
        </View>
      </Bolum>

      <Bolum title={t.forecast}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.days}
          testID="hava-tahmin"
        >
          {days.map((d, i) => (
            <View key={d.key} style={[styles.day, i === 0 && styles.dayToday]} testID="hava-gun">
              <Text style={[styles.dayName, i === 0 && styles.onBand]}>{d.day}</Text>
              <Icon
                name={d.rain !== '-' && d.rain !== '0 mm' ? 'drop' : 'sun'}
                size={26}
                color={i === 0 ? homeColors.text : homeColors.tabSelected}
              />
              <Text style={[styles.dayTemp, i === 0 && styles.onBand]}>{d.minMax}</Text>
              <Text style={[styles.dayRain, i === 0 && styles.onBand]}>{d.rain}</Text>
            </View>
          ))}
        </ScrollView>
      </Bolum>

      {showFrost ? (
        <Card style={[styles.frost, warn && styles.warn]} testID="hava-don">
          <View style={styles.frostHead}>
            <Icon name="warning" size={20} color={warn ? colors.amberText : colors.forest} />
            <Text style={styles.label}>{t.frost}</Text>
          </View>
          <Text style={styles.body} testID="hava-don-baslik">
            {frost.title}
          </Text>
          <Text style={styles.small}>{frost.body}</Text>
          {'why' in frost && warn ? <Text style={styles.small}>{frost.why}</Text> : null}
        </Card>
      ) : null}

      <Card style={styles.water}>
        <Icon name="drop" size={22} color={colors.water} />
        <Text style={styles.waterText}>
          {t.et0}: {today.et0.mmPerDay.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm/gün
        </Text>
      </Card>
      {w.sample ? (
        <View style={styles.sample} testID="hava-ornek">
          <Rozet label={tr.common.sampleData} />
        </View>
      ) : null}
      <BilgiKarti title={t.howTitle} lines={[...t.how]} testID="hava-nasil" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: homeColors.band,
    borderRadius: radius.card,
    padding: 16,
    gap: 4,
    ...elevation.raised,
  },
  heroPlace: { fontFamily: fontFamily.extrabold, fontSize: 18, color: homeColors.text },
  heroSub: { fontFamily: fontFamily.semibold, fontSize: 14, color: homeColors.text },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  heroIcon: { width: 84, height: 84 },
  heroTempBox: { flex: 1 },
  heroTemp: {
    fontFamily: fontFamily.extrabold,
    fontSize: 52,
    lineHeight: 58,
    color: homeColors.text,
  },
  heroText: { fontFamily: fontFamily.bold, fontSize: 16, color: homeColors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 2,
    ...elevation.card,
  },
  cellValue: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  cellLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  days: { gap: 10, paddingVertical: 4, paddingRight: 4 },
  day: {
    width: 92,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  dayToday: { backgroundColor: homeColors.band, borderColor: homeColors.band },
  dayName: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.forest },
  dayTemp: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  dayRain: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  onBand: { color: homeColors.text },
  frost: { gap: 4 },
  frostHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  water: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.waterSoft,
  },
  waterText: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.water },
  sample: { flexDirection: 'row' },
  label: { fontFamily: fontFamily.extrabold, fontSize: fontSize.caption, color: colors.amberText },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
