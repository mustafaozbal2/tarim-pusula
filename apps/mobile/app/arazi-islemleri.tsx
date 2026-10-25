import { capabilitiesFor } from '@tarim/schemas';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Durum, fontFamily, fontSize, spacing } from '@tarim/ui';
import type { DeviceDto } from '../src/api/client';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { useToday } from '../src/hooks/useToday';
import { hubCards } from '../src/hub/model';
import { tr } from '../src/i18n/tr';
import { api } from '../src/session';
import { clock, frostCardModel, waterNeedText } from '../src/today/model';

const t = tr.hub;

/**
 * Arazi İşlemleri: ana sayfadan çıkan don/su bilgisi + işlem kartları. Cihaz kartları kendiliğinden
 * gelir (sulama cihazı > Sulama, sensör > Nem, drone > görev); mod seçimi yoktur.
 */
export default function HubScreen() {
  const router = useRouter();
  const { data, state, reload } = useToday();
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  useFocusEffect(
    useCallback(() => {
      void api
        .devices()
        .then(setDevices)
        .catch(() => setDevices([]));
    }, []),
  );
  const fieldId = data?.field.id;
  const caps = useMemo(
    () => capabilitiesFor(devices.filter((d) => d.fieldId === fieldId).map((d) => d.kind)),
    [devices, fieldId],
  );
  const cards = hubCards(caps);

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
  const frost = frostCardModel(data.today.frost);
  const warn = frost.kind === 'warning' || frost.kind === 'watch';
  const showFrost = warn || frost.kind === 'quiet';
  const water = waterNeedText(data.today.waterNeed);

  return (
    <Screen title={t.title}>
      <Text style={styles.field} testID="hub-arazi">
        {data.field.name}
      </Text>
      {showFrost ? (
        <View style={[styles.band, warn && styles.bandWarn]} testID="bugun-don-karti">
          <Icon name="warning" size={18} color={colors.amberText} />
          <Text style={styles.bandTitle} testID="bugun-don-baslik">
            {frost.title}
          </Text>
        </View>
      ) : null}
      {water ? (
        <Text style={styles.muted} testID="bugun-su">
          {tr.today.waterTitle}: {water}
        </Text>
      ) : null}
      <Text style={styles.muted} testID="bugun-guncelleme">
        {tr.today.lastUpdate}: {clock(data.at)} · {tr.common.source}: {data.today.weather.source}
      </Text>

      <View style={styles.grid} testID="hub-kartlar">
        {cards.map((c) => (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={c.title}
            testID={`hub-${c.key}`}
            onPress={() => router.push({ pathname: c.route as never, params: { fieldId } })}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardHint}>{c.hint}</Text>
          </Pressable>
        ))}
      </View>
      {caps.length === 0 ? (
        <Card style={styles.info}>
          <Text style={styles.cardHint}>{t.noDevices}</Text>
          <Button
            label={t.addDevice}
            variant="secondary"
            onPress={() => router.push('/cihaz-ekle')}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.pistachio,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
  },
  bandWarn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  bandTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.small,
    color: colors.forest,
  },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.caption, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '48.5%',
    minHeight: 76,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: 2,
  },
  cardTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  cardHint: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  info: { gap: spacing.md },
});
