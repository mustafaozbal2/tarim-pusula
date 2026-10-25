import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, colors, fontFamily, fontSize } from '@tarim/ui';
import { getCksProvider, type CksParcel, type CksStatus } from '@tarim/devices';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { tr } from '../src/i18n/tr';

const t = tr.cks;

/** ÇKS bağlantı hazırlığı: sahte sağlayıcı, gerçek çağrı yok (G20.4). */
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
      <FlowHeader />
      <Text accessibilityRole="header" style={styles.title}>
        {t.title}
      </Text>
      <Text style={styles.muted}>{t.intro}</Text>
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
  title: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  card: { gap: 4 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
});
