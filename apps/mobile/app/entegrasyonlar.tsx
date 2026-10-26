import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, colors, fontFamily, fontSize, homeColors } from '@tarim/ui';
import { getCksProvider, type CksParcel, type CksStatus } from '@tarim/devices';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { Bolum, SayfaGorseli } from '../src/components/Gorsel';
import { tr } from '../src/i18n/tr';

const t = tr.cks;

/**
 * ÇKS bağlantısı (G20.4, G23.15: çiftçiye açıklayıcı). Sahte sağlayıcı; gerçek çağrı yok. ÇKS'nin ne
 * olduğu, bağlanınca ne kazanılacağı ve şu anki durum sade dille anlatılır.
 */
export default function IntegrationsScreen() {
  const [status, setStatus] = useState<CksStatus | null>(null);
  const [parcels, setParcels] = useState<CksParcel[]>([]);

  useEffect(() => {
    const p = getCksProvider();
    void p.status().then(setStatus);
    void p.listParcels().then(setParcels);
  }, []);

  return (
    <FlowScreen>
      <FlowHeader title={t.title} />
      <SayfaGorseli image="genis_hizmet.jpg" text={t.intro} />

      <Bolum title={t.whatTitle}>
        <Card style={styles.card}>
          <Text style={styles.body}>{t.what}</Text>
        </Card>
      </Bolum>

      <Bolum title={t.gainTitle}>
        {t.gains.map((g, i) => (
          <View key={g} style={styles.step}>
            <View style={styles.no}>
              <Text style={styles.noText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{g}</Text>
          </View>
        ))}
      </Bolum>

      <Card style={styles.card} testID="cks-durum">
        <Text style={styles.name}>{t.stateLabel}</Text>
        <Text style={styles.muted}>{t.statePending}</Text>
        {status ? <Notice>{status.message}</Notice> : null}
        <Text style={styles.muted}>{t.noCall}</Text>
        <Text style={styles.muted}>{t.why}</Text>
      </Card>
      <Text style={styles.name}>{t.parcels}</Text>
      {parcels.length === 0 ? <Text style={styles.muted}>{t.noParcels}</Text> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  no: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: homeColors.band,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: homeColors.text },
  stepText: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.body,
    color: colors.forest,
  },
});
