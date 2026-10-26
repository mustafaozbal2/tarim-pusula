import { capabilitiesFor } from '@tarim/schemas';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Durum, fontFamily, fontSize, spacing } from '@tarim/ui';
import type { DeviceDto } from '../src/api/client';
import { Bolum, IkonKart, KartIzgara, SayfaGorseli } from '../src/components/Gorsel';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { useToday } from '../src/hooks/useToday';
import { hubCards } from '../src/hub/model';
import { tr } from '../src/i18n/tr';
import { api } from '../src/session';
import { frostCardModel, waterNeedText } from '../src/today/model';

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
  const frost = frostCardModel(data.today.frost);
  const warn = frost.kind === 'warning' || frost.kind === 'watch';
  const showFrost = warn || frost.kind === 'quiet';
  const water = waterNeedText(data.today.waterNeed);

  return (
    <Screen title={t.title}>
      <SayfaGorseli image="genis_tarla.jpg" text={t.hero} />
      <Bolum title={t.fieldSection}>
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
        <IkonKart
          wide
          image="ikon_ekle.png"
          title={t.add}
          hint={t.addHint}
          testID="hub-ekle"
          onPress={() => router.push('/tarla-ekle')}
        />
        <IkonKart
          wide
          image="ikon_arazi_ekle.png"
          title={t.edit}
          hint={t.editHint}
          testID="hub-guncelle"
          onPress={() => router.push({ pathname: '/arazi-duzenle', params: { fieldId } })}
        />
        <IkonKart
          wide
          icon="warning"
          tone="danger"
          title={t.remove}
          hint={t.removeHint}
          testID="hub-sil"
          onPress={() => router.push({ pathname: '/arazi-duzenle', params: { fieldId, sil: '1' } })}
        />
      </Bolum>

      <Bolum title={t.tools}>
        <KartIzgara testID="hub-kartlar">
          {cards.map((c) => (
            <IkonKart
              key={c.key}
              title={c.title}
              hint={c.hint}
              image={c.image}
              icon={c.icon}
              testID={`hub-${c.key}`}
              onPress={() => router.push({ pathname: c.route as never, params: { fieldId } })}
            />
          ))}
        </KartIzgara>
      </Bolum>
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
  cardHint: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  info: { gap: spacing.md },
});
