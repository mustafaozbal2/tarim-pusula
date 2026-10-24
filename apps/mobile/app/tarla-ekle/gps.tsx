import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, colors, fontFamily } from '@tarim/ui';
import { FlowHeader, FlowScreen, titleStyle } from '../../src/components/FlowParts';
import { withPoint } from '../../src/flow/draft';
import { updateDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { expoLocation } from '../../src/location/expoLocation';
import { locateOnce } from '../../src/location/gps';

const t = tr.flow;

/** Tarladayım: izin nedeni büyük yazıyla anlatılır; reddedilirse köy listesine düşülür. */
export default function GpsScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function locate() {
    setBusy(true);
    const r = await locateOnce(expoLocation);
    setBusy(false);
    if (r.ok) {
      updateDraft((d) => withPoint(d, r, 'gps'));
      router.replace('/tarla-ekle/harita');
    } else {
      updateDraft((d) => ({ ...d, notice: 'gps-reddedildi' }));
      router.replace('/tarla-ekle/koy');
    }
  }

  return (
    <FlowScreen
      footer={
        <Button
          label={busy ? t.gpsSearching : t.gpsAllow}
          onPress={busy ? undefined : () => void locate()}
          style={{ minHeight: 48 }}
        />
      }
    >
      <FlowHeader step={t.step1} />
      <Text accessibilityRole="header" style={titleStyle}>
        {t.gpsTitle}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: 17,
          lineHeight: 32,
          color: colors.forest,
        }}
        testID="gps-neden"
      >
        {t.gpsWhy}
      </Text>
    </FlowScreen>
  );
}
